// @vitest-environment node
// Full lifecycle against a real IndexedDB implementation: intake stores
// the full blob plus a thumbnail, duplicates drop the full blob but keep
// the thumbnail, removal and trim delete both keys, and the popup-side
// reader resolves thumbnails with a full-blob fallback.
import 'fake-indexeddb/auto';

import { type IDBPDatabase, openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoIntakeContext } from '@/entrypoints/background/photoIntake';
import { enqueuePhotoFile } from '@/entrypoints/background/photoIntake';
import { trimProcessed } from '@/entrypoints/background/taskUtils';
import {
    deleteFullBlob,
    deleteStoredBlobs,
    storeThumbnail,
} from '@/entrypoints/background/thumbnails';
import type { UploadTask } from '@/entrypoints/background/types';
import { IMAGE_STORE, readTaskThumbnail } from '@/utils/imageStore';

let dbCounter = 0;
const openRealDb = (): Promise<IDBPDatabase> =>
    openDB(`booru-uploader-test-${dbCounter++}`, 1, {
        upgrade(db) {
            db.createObjectStore(IMAGE_STORE);
        },
    });

const baseTask = {
    id: 'task-1',
    endpoint: 'https://example.test',
    retries: 0,
    status: 'queued' as const,
};

const makeCtx = (
    db: IDBPDatabase,
    imageHashes: Record<string, Set<string>> = {},
) => {
    const computeHash = vi.fn(async () => 'deadbeef');
    const getHash = vi.fn(async () => false);
    const queued: UploadTask[] = [];
    return {
        ctx: {
            db,
            imageHashes,
            queuedTasks: {
                items: queued,
                put: (task: UploadTask) => {
                    queued.push(task);
                },
            },
            processedTasks: [] as UploadTask[],
            computeHash,
            getHash,
        } as unknown as PhotoIntakeContext,
        computeHash,
        getHash,
    };
};

const stubImaging = (width = 800, height = 600) => {
    vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => ({ width, height, close: vi.fn() })),
    );
    vi.stubGlobal(
        'OffscreenCanvas',
        vi.fn(function (this: unknown, width: number, height: number) {
            return {
                width,
                height,
                getContext: () => ({ drawImage: vi.fn() }),
                convertToBlob: vi.fn(async () => new Blob(['thumb'])),
            };
        }),
    );
};

afterEach(() => {
    // Only what this file stubs (jsdom-less env has no built-ins here);
    // notably leaves the fake-indexeddb globals installed above alone.
    delete (globalThis as Record<string, unknown>).createImageBitmap;
    delete (globalThis as Record<string, unknown>).OffscreenCanvas;
    vi.restoreAllMocks();
});

describe('thumbnail lifecycle in IndexedDB', () => {
    it('stores full blob plus thumbnail at intake', async () => {
        stubImaging();
        const db = await openRealDb();
        const { ctx, computeHash } = makeCtx(db);
        const blob = new Blob(['pixels'], { type: 'image/png' });

        await expect(
            enqueuePhotoFile(ctx, baseTask, blob, 'https://example.test'),
        ).resolves.toBe(true);

        expect(computeHash).not.toHaveBeenCalled();
        const full = await db.get(IMAGE_STORE, 'task-1');
        expect(full).toBeInstanceOf(Blob);
        const thumb = await db.get(IMAGE_STORE, 'task-1:thumb');
        expect(thumb).toBeInstanceOf(Blob);
        expect(ctx.queuedTasks.items).toHaveLength(1);
    });

    it('drops the full blob on duplicates and keeps the thumbnail', async () => {
        stubImaging();
        const db = await openRealDb();
        const { ctx, getHash } = makeCtx(db, {
            'https://example.test': new Set(['deadbeef']),
        });
        getHash.mockResolvedValue(true);
        const blob = new Blob(['pixels'], { type: 'image/png' });

        await expect(
            enqueuePhotoFile(ctx, baseTask, blob, 'https://example.test'),
        ).resolves.toBe('duplicate');

        expect(await db.get(IMAGE_STORE, 'task-1')).toBeUndefined();
        const dupThumb = await db.get(IMAGE_STORE, 'task-1:thumb');
        expect(dupThumb).toBeInstanceOf(Blob);
    });

    it('falls back to the original bytes when imaging APIs are missing', async () => {
        const db = await openRealDb();
        const blob = new Blob(['pixels'], { type: 'image/png' });
        await db.put(IMAGE_STORE, blob, 'task-1');

        // No OffscreenCanvas/createImageBitmap in this environment.
        await storeThumbnail(db, 'task-1');
        const thumb = await db.get(IMAGE_STORE, 'task-1:thumb');
        expect(thumb).toBeInstanceOf(Blob);
        expect(await (thumb as Blob).text()).toBe('pixels');
    });

    it('deletes both keys on removal and tolerates missing entries', async () => {
        const db = await openRealDb();
        await db.put(IMAGE_STORE, new Blob(['x']), 'task-1');
        await db.put(IMAGE_STORE, new Blob(['x']), 'task-1:thumb');

        await deleteStoredBlobs(db, 'task-1');
        expect(await db.get(IMAGE_STORE, 'task-1')).toBeUndefined();
        expect(await db.get(IMAGE_STORE, 'task-1:thumb')).toBeUndefined();
        // Deleting unknown keys is a no-op, not an error.
        await deleteFullBlob(db, 'missing');
        await deleteStoredBlobs(undefined, 'missing');
    });

    it('trim evicts oldest terminal tasks and deletes both keys', async () => {
        const db = await openRealDb();
        const processed: UploadTask[] = [
            {
                ...baseTask,
                id: 'new',
                status: 'complete',
                type: 'photoUrl',
                url: 'https://example.test/n.jpg',
            },
            {
                ...baseTask,
                id: 'old',
                status: 'complete',
                type: 'photoUrl',
                url: 'https://example.test/o.jpg',
            },
        ];
        for (const task of processed) {
            await db.put(IMAGE_STORE, new Blob(['x']), task.id);
            await db.put(IMAGE_STORE, new Blob(['x']), `${task.id}:thumb`);
        }

        const evicted = trimProcessed(processed, 1);
        expect(evicted.map((t) => t.id)).toEqual(['old']);
        for (const task of evicted) {
            await deleteStoredBlobs(db, task.id);
        }
        expect(await db.get(IMAGE_STORE, 'old')).toBeUndefined();
        expect(await db.get(IMAGE_STORE, 'old:thumb')).toBeUndefined();
        expect(await db.get(IMAGE_STORE, 'new:thumb')).toBeInstanceOf(Blob);
        expect(processed.map((t) => t.id)).toEqual(['new']);
    });

    it('reads thumbnails through the popup-side reader', async () => {
        // readTaskThumbnail opens the production database by name.
        const db = await openDB('booru-uploader', 2, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(IMAGE_STORE)) {
                    db.createObjectStore(IMAGE_STORE);
                }
            },
        });
        await db.put(IMAGE_STORE, new Blob(['full-bytes']), 'task-1');
        await db.put(IMAGE_STORE, new Blob(['thumb-bytes']), 'task-1:thumb');

        const read = await readTaskThumbnail('task-1');
        expect(read).toBeInstanceOf(Blob);
        expect(await read!.text()).toBe('thumb-bytes');
        db.close();
    });
});
