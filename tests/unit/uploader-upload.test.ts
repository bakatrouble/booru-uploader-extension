import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ky', () => ({
    default: {
        extend: vi.fn(),
        create: vi.fn(),
    },
}));

// Relative path (not `@/...`): mock ids with the `?worker` query must
// bypass alias resolution to match the import in uploader.ts.
vi.mock('../../utils/hasherWorker?worker', () => ({
    default: class {
        postMessage = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
    },
}));

vi.mock('idb', () => ({
    openDB: vi.fn(async () => ({
        clear: vi.fn(async () => {}),
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
    })),
}));

import ky from 'ky';
import type { UploadTask } from '@/entrypoints/background/uploader';
import { Uploader } from '@/entrypoints/background/uploader';
import { Queue } from '@/utils/queue';
import { Semaphore } from '@/utils/semaphore';
import { stubBrowser } from './setup';

const mockedExtend = vi.mocked(ky.extend);

const kyResponse = <T>(payload: T) =>
    Object.assign(Promise.resolve(payload), {
        json: async () => payload,
    });

// 1x1 transparent PNG.
const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const makeUploader = () => {
    const uploader = Object.create(Uploader.prototype) as Uploader;
    uploader.queuedTasks = new Queue<UploadTask>();
    uploader.processedTasks = [];
    uploader.ports = new Set();
    uploader.imageHashes = {};
    uploader.uploadGate = new Semaphore(3);
    (uploader as unknown as { db: unknown }).db = undefined;
    (uploader as unknown as { dbReady: Promise<unknown> }).dbReady =
        Promise.resolve(undefined);
    (uploader as unknown as { hasherWorker: unknown }).hasherWorker = {
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    return uploader;
};

describe('Uploader.handleMessage photo uploads', () => {
    let uploader: Uploader;
    let dbPut: ReturnType<typeof vi.fn>;
    let dbDelete: ReturnType<typeof vi.fn>;

    const respondHash = (hash: string) => {
        const worker = uploader.hasherWorker as unknown as {
            postMessage: ReturnType<typeof vi.fn>;
            addEventListener: ReturnType<typeof vi.fn>;
        };
        const listeners: Array<(e: unknown) => void> = [];
        worker.addEventListener.mockImplementation(
            (_type: string, listener: (e: unknown) => void) => {
                listeners.push(listener);
            },
        );
        worker.postMessage.mockImplementation(
            (msg: { id: string; buffer: Uint8Array }) => {
                for (const listener of listeners) {
                    listener({ data: { id: msg.id, hash } });
                }
            },
        );
    };

    beforeEach(() => {
        uploader = makeUploader();
        mockedExtend.mockReset();
        mockedExtend.mockReturnValue({
            get: (path: string) => {
                if (path === 'hashes') {
                    return kyResponse({ hashes: [] as string[] });
                }
                return kyResponse({ exists: false });
            },
        } as never);
        dbPut = vi.fn(async () => {});
        dbDelete = vi.fn(async () => {});
        (uploader as unknown as { db: unknown }).db = {
            put: dbPut,
            get: vi.fn(async (_store: string, key: string) =>
                key.endsWith(':thumb') ? null : new Blob(['full']),
            ),
            delete: dbDelete,
        };
        respondHash('deadbeef');
    });

    it('stores the full blob plus a thumbnail at intake', async () => {
        await uploader.handleMessage(
            {
                type: 'upload',
                endpoint: 'https://example.test',
                method: 'photoBase64',
                data: `data:image/png;base64,${tinyPngBase64}`,
            } as never,
            undefined,
        );

        expect(uploader.queuedTasks.items).toHaveLength(1);
        const task = uploader.queuedTasks.items[0]!;
        expect(task.type).toBe('photoFile');
        expect(task).not.toHaveProperty('file');
        expect(dbPut).toHaveBeenCalledTimes(2);
        const [, fullBlob, fullKey] = dbPut.mock.calls[0]!;
        const [, thumbBlob, thumbKey] = dbPut.mock.calls[1]!;
        expect(fullBlob).toBeInstanceOf(Blob);
        expect(fullKey).toBe(task.id);
        expect(thumbBlob).toBeInstanceOf(Blob);
        expect(thumbKey).toBe(`${task.id}:thumb`);
        expect(uploader.processedTasks).toEqual([]);
    });

    it('accepts base64 without the data: prefix as JPEG', async () => {
        await uploader.handleMessage(
            {
                type: 'upload',
                endpoint: 'https://example.test',
                method: 'photoBase64',
                data: tinyPngBase64,
            } as never,
            undefined,
        );

        expect(uploader.queuedTasks.items).toHaveLength(1);
        const [, storedBlob] = dbPut.mock.calls[0]!;
        expect((storedBlob as Blob).type).toBe('image/jpeg');
    });

    it('queues an ArrayBuffer photo with the given MIME type', async () => {
        const bytes = new Uint8Array([137, 80, 78, 71]);
        await uploader.handleMessage(
            {
                type: 'upload',
                endpoint: 'https://example.test',
                method: 'photoArrayBuffer',
                data: bytes.buffer,
                mimeType: 'image/png',
            } as never,
            undefined,
        );

        expect(uploader.queuedTasks.items).toHaveLength(1);
        const task = uploader.queuedTasks.items[0]!;
        expect(task.type).toBe('photoFile');
        const [, storedBlob] = dbPut.mock.calls[0]!;
        expect((storedBlob as Blob).type).toBe('image/png');
    });

    it('defaults ArrayBuffer photos to image/jpeg', async () => {
        const bytes = new Uint8Array([1, 2, 3]);
        await uploader.handleMessage(
            {
                type: 'upload',
                endpoint: 'https://example.test',
                method: 'photoArrayBuffer',
                data: bytes.buffer,
            } as never,
            undefined,
        );

        const [, storedBlob] = dbPut.mock.calls[0]!;
        expect((storedBlob as Blob).type).toBe('image/jpeg');
    });

    it('notifies immediately even when intake is gated', async () => {
        uploader.uploadGate = new Semaphore(1);
        const release = await uploader.uploadGate.acquire();

        const pending = uploader.handleMessage(
            {
                type: 'upload',
                endpoint: 'https://example.test',
                method: 'photoUrl',
                url: 'https://example.test/i.jpg',
            } as never,
            7,
        );
        await vi.waitFor(() =>
            expect(stubBrowser.tabs.sendMessage).toHaveBeenCalledWith(7, {
                type: 'notification',
                options: {
                    level: 'loading',
                    message: 'Uploading picture...',
                },
            }),
        );

        release();
        await pending;
        expect(uploader.queuedTasks.items).toHaveLength(1);
    });

    it('waits for the database before storing anything', async () => {
        // Simulates an upload landing before the async idb open
        // completes: without the ensureDb gate the blob, thumbnail and
        // duplicate bookkeeping would silently vanish.
        let resolveDb!: (db: unknown) => void;
        (uploader as unknown as { db: unknown }).db = undefined;
        (uploader as unknown as { dbReady: Promise<unknown> }).dbReady =
            new Promise((resolve) => {
                resolveDb = resolve;
            });

        const pending = uploader.handleMessage(
            {
                type: 'upload',
                endpoint: 'https://example.test',
                method: 'photoArrayBuffer',
                data: new Uint8Array([1, 2, 3]).buffer,
            } as never,
            undefined,
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(dbPut).not.toHaveBeenCalled();
        expect(uploader.queuedTasks.items).toEqual([]);

        resolveDb({
            put: dbPut,
            get: vi.fn(async () => new Blob(['full'])),
            delete: dbDelete,
        });
        await pending;
        expect(dbPut).toHaveBeenCalledWith(
            'images',
            expect.any(Blob),
            expect.any(String),
        );
        expect(uploader.queuedTasks.items).toHaveLength(1);
    });

    it('marks ArrayBuffer duplicates without queueing', async () => {
        uploader.imageHashes['https://example.test'] = new Set(['deadbeef']);
        mockedExtend.mockReturnValue({
            get: (path: string) => {
                if (path === 'hashes') {
                    return kyResponse({ hashes: ['deadbeef'] });
                }
                return kyResponse({ exists: true });
            },
        } as never);

        const bytes = new Uint8Array([1, 2, 3]);
        await uploader.handleMessage(
            {
                type: 'upload',
                endpoint: 'https://example.test',
                method: 'photoArrayBuffer',
                data: bytes.buffer,
            } as never,
            undefined,
        );

        expect(uploader.queuedTasks.items).toEqual([]);
        expect(uploader.processedTasks).toHaveLength(1);
        expect(uploader.processedTasks[0]!.status).toBe('duplicate');
        const duplicateId = uploader.processedTasks[0]!.id;
        // The full blob is dropped (it never uploads); the thumbnail stays.
        expect(dbDelete).toHaveBeenCalledWith('images', duplicateId);
        expect(dbDelete).not.toHaveBeenCalledWith(
            'images',
            `${duplicateId}:thumb`,
        );
    });
});
