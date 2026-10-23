import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { Mutex } from '@/utils/mutex';
import { Queue } from '@/utils/queue';

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
    uploader.uploadLock = new Mutex();
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
    let createObjectURL: ReturnType<typeof vi.fn>;
    let realCreateObjectURL: typeof URL.createObjectURL | undefined;

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
        (uploader as unknown as { db: unknown }).db = {
            put: dbPut,
            get: vi.fn(async () => null),
        };
        respondHash('deadbeef');
        realCreateObjectURL = URL.createObjectURL;
        createObjectURL = vi.fn(() => 'blob:fake-url');
        URL.createObjectURL = createObjectURL as never;
    });

    afterEach(() => {
        URL.createObjectURL = realCreateObjectURL as never;
    });

    it('queues a base64 photo with a single object URL', async () => {
        await uploader.handleMessage(
            {
                type: 'upload',
                endpoint: 'https://example.test',
                method: 'photoBase64',
                data: `data:image/png;base64,${tinyPngBase64}`,
            } as never,
            undefined,
        );

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(uploader.queuedTasks.items).toHaveLength(1);
        const task = uploader.queuedTasks.items[0]!;
        expect(task.type).toBe('photoFile');
        expect((task as { file: string }).file).toBe('blob:fake-url');
        expect(dbPut).toHaveBeenCalledTimes(1);
        const [, storedBlob, storedId] = dbPut.mock.calls[0]!;
        expect(storedBlob).toBeInstanceOf(Blob);
        expect(storedId).toBe(task.id);
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

        expect(createObjectURL).toHaveBeenCalledTimes(1);
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

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(uploader.queuedTasks.items).toHaveLength(1);
        const task = uploader.queuedTasks.items[0]!;
        expect(task.type).toBe('photoFile');
        expect((task as { file: string }).file).toBe('blob:fake-url');
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

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(uploader.queuedTasks.items).toEqual([]);
        expect(uploader.processedTasks).toHaveLength(1);
        expect(uploader.processedTasks[0]!.status).toBe('duplicate');
        expect((uploader.processedTasks[0]! as { file: string }).file).toBe(
            'blob:fake-url',
        );
    });
});
