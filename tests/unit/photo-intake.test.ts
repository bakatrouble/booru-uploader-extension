import { describe, expect, it, vi } from 'vitest';
import {
    enqueuePhotoFile,
    normalizePhotoInput,
    type PhotoIntakeContext,
} from '@/entrypoints/background/photoIntake';
import type { UploadTask } from '@/entrypoints/background/types';
import { Queue } from '@/utils/queue';

const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('normalizePhotoInput', () => {
    it('accepts full data URLs as-is', async () => {
        const blob = await normalizePhotoInput({
            method: 'photoBase64',
            data: `data:image/png;base64,${tinyPngBase64}`,
        });
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('image/png');
    });

    it('wraps raw base64 as JPEG', async () => {
        const blob = await normalizePhotoInput({
            method: 'photoBase64',
            data: tinyPngBase64,
        });
        expect(blob.type).toBe('image/jpeg');
    });

    it('builds blobs from ArrayBuffers with MIME default', async () => {
        const bytes = new Uint8Array([137, 80, 78, 71]);
        const blob = await normalizePhotoInput({
            method: 'photoArrayBuffer',
            data: bytes.buffer as ArrayBuffer,
        });
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('image/jpeg');
        expect(blob.size).toBe(4);
    });
});

describe('enqueuePhotoFile', () => {
    const base = {
        id: 'task-1',
        apiKey: 'test-key',
        retries: 0,
        status: 'queued' as const,
    };

    const makeDb = (full: Blob | null) => ({
        put: vi.fn(async () => {}),
        get: vi.fn(async () => full),
        delete: vi.fn(async () => {}),
    });

    it('stores the full blob plus a thumbnail, then queues', async () => {
        const blob = new Blob(['pixels'], { type: 'image/jpeg' });
        const db = makeDb(blob);
        const computeHash = vi.fn(async () => 'deadbeef');
        const ctx: PhotoIntakeContext = {
            db: db as never,
            imageHashes: {},
            queuedTasks: new Queue<UploadTask>(),
            processedTasks: [],
            computeHash,
            getHash: vi.fn(async () => false),
        };

        await expect(
            enqueuePhotoFile(ctx, base, blob, 'test-key'),
        ).resolves.toBe(true);

        expect(db.put).toHaveBeenCalledWith('images', blob, 'task-1');
        expect(db.put).toHaveBeenCalledWith(
            'images',
            expect.any(Blob),
            'task-1:thumb',
        );
        expect(ctx.queuedTasks.items).toHaveLength(1);
        expect(ctx.queuedTasks.items[0]).not.toHaveProperty('file');
        expect(computeHash).not.toHaveBeenCalled();
    });

    it('marks duplicates without queueing and drops the full blob', async () => {
        const blob = new Blob(['pixels'], { type: 'image/jpeg' });
        const db = makeDb(blob);
        const getHash = vi.fn(async () => true);
        const ctx: PhotoIntakeContext = {
            db: db as never,
            imageHashes: { 'test-key': new Set(['deadbeef']) },
            queuedTasks: new Queue<UploadTask>(),
            processedTasks: [],
            computeHash: vi.fn(async () => 'deadbeef'),
            getHash,
        };

        await expect(
            enqueuePhotoFile(ctx, base, blob, 'test-key'),
        ).resolves.toBe('duplicate');

        expect(ctx.queuedTasks.items).toEqual([]);
        expect(ctx.processedTasks).toHaveLength(1);
        expect(ctx.processedTasks[0]!.status).toBe('duplicate');
        expect(getHash).toHaveBeenCalledWith('test-key', 'deadbeef');
        // Full blob dropped (never uploads); thumbnail stays for display.
        expect(db.delete).toHaveBeenCalledWith('images', 'task-1');
        expect(db.delete).not.toHaveBeenCalledWith('images', 'task-1:thumb');
    });
});
