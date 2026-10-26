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
import { stubBrowser } from './setup';

const mockedExtend = vi.mocked(ky.extend);

const makeTask = (overrides: Partial<UploadTask> = {}): UploadTask =>
    ({
        id: 'w1',
        apiKey: 'test-key',
        retries: 0,
        status: 'queued',
        type: 'photoUrl',
        url: 'https://example.test/i.jpg',
        ...overrides,
    }) as UploadTask;

const makeUploader = (tasks: UploadTask[]) => {
    const uploader = Object.create(Uploader.prototype) as Uploader;
    const items = [...tasks];
    let waits = 0;
    uploader.queuedTasks = {
        items,
        wait: async () => {
            waits += 1;
            if (waits > 1 || items.length === 0) throw new Error('stop');
            return items[0]!;
        },
        shift: vi.fn(() => {
            items.shift();
        }),
        put: vi.fn((task: UploadTask) => {
            items.push(task);
        }),
    } as never;
    uploader.processedTasks = [];
    uploader.ports = new Set([{ postMessage: vi.fn() } as never]);
    // Intake always runs getHashes first, creating the endpoint set.
    uploader.imageHashes = { 'test-key': new Set() };
    uploader.processingDisplaying = false;
    uploader.db = {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
    } as never;
    return uploader;
};

describe('Uploader.worker', () => {
    beforeEach(() => {
        mockedExtend.mockReset();
        mockedExtend.mockReturnValue({
            post: () => ({
                status: 200,
                json: async () => ({
                    status: 'ok',
                    hash: 'h1',
                    upload_id: 'u1',
                }),
            }),
        } as never);
    });

    it('uploads a task, caches its hash and clears the badge', async () => {
        const uploader = makeUploader([makeTask()]);
        await expect(uploader.worker()).rejects.toThrow('stop');

        const [task] = uploader.processedTasks;
        expect(task!.status).toBe('complete');
        expect(task!.retries).toBe(0);
        expect(uploader.imageHashes['test-key']).toEqual(new Set(['h1']));
        expect(uploader.queuedTasks.items).toEqual([]);
        const [port] = [...uploader.ports];
        const lastMessage = (
            port as unknown as { postMessage: ReturnType<typeof vi.fn> }
        ).postMessage.mock.calls.at(-1)![0] as {
            processed: UploadTask[];
        };
        expect(lastMessage.processed[0]!.status).toBe('complete');
        expect(stubBrowser.browserAction.setBadgeText).toHaveBeenCalledWith({
            text: '',
        });
    });

    it('drops the full blob after a photo upload, keeping the thumbnail key', async () => {
        const blob = new Blob(['pixels'], { type: 'image/jpeg' });
        const uploader = makeUploader([makeTask({ type: 'photoFile' })]);
        (uploader.db as unknown as { get: ReturnType<typeof vi.fn> }).get =
            vi.fn(async () => blob);

        await expect(uploader.worker()).rejects.toThrow('stop');

        expect(uploader.processedTasks[0]!.status).toBe('complete');
        const db = uploader.db as unknown as {
            delete: ReturnType<typeof vi.fn>;
        };
        expect(db.delete).toHaveBeenCalledWith('images', 'w1');
        expect(db.delete).not.toHaveBeenCalledWith('images', 'w1:thumb');
    });

    it('marks unrecoverable server errors failed without retrying', async () => {
        mockedExtend.mockReturnValue({
            post: () => ({
                status: 400,
                json: async () => ({ status: 'error', message: 'bad' }),
            }),
        } as never);
        const uploader = makeUploader([makeTask()]);
        await expect(uploader.worker()).rejects.toThrow('stop');

        expect(uploader.processedTasks[0]!.status).toBe('failed');
        expect(uploader.processedTasks[0]!.retries).toBe(0);
    });
});
