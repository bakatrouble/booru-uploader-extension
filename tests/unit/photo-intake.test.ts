import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    let createObjectURL: ReturnType<typeof vi.fn>;
    let realCreateObjectURL: typeof URL.createObjectURL | undefined;

    beforeEach(() => {
        realCreateObjectURL = URL.createObjectURL;
        createObjectURL = vi.fn(() => 'blob:fake-url');
        URL.createObjectURL = createObjectURL as never;
    });

    afterEach(() => {
        URL.createObjectURL = realCreateObjectURL as never;
    });

    const base = {
        id: 'task-1',
        endpoint: 'https://example.test',
        retries: 0,
        status: 'queued' as const,
    };

    it('queues with a single object URL when hashes are unknown', async () => {
        const dbPut = vi.fn(async () => {});
        const computeHash = vi.fn(async () => 'deadbeef');
        const ctx: PhotoIntakeContext = {
            db: { put: dbPut } as never,
            imageHashes: {},
            queuedTasks: new Queue<UploadTask>(),
            processedTasks: [],
            computeHash,
            getHash: vi.fn(async () => false),
        };

        const blob = new Blob(['pixels'], { type: 'image/jpeg' });
        await expect(
            enqueuePhotoFile(ctx, base, blob, 'https://example.test'),
        ).resolves.toBe(true);

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(ctx.queuedTasks.items).toHaveLength(1);
        expect(dbPut).toHaveBeenCalledWith('images', blob, 'task-1');
        expect(computeHash).not.toHaveBeenCalled();
    });

    it('marks duplicates without queueing', async () => {
        const dbPut = vi.fn(async () => {});
        const getHash = vi.fn(async () => true);
        const ctx: PhotoIntakeContext = {
            db: { put: dbPut } as never,
            imageHashes: { 'https://example.test': new Set(['deadbeef']) },
            queuedTasks: new Queue<UploadTask>(),
            processedTasks: [],
            computeHash: vi.fn(async () => 'deadbeef'),
            getHash,
        };

        const blob = new Blob(['pixels'], { type: 'image/jpeg' });
        await expect(
            enqueuePhotoFile(ctx, base, blob, 'https://example.test'),
        ).resolves.toBe('duplicate');

        expect(ctx.queuedTasks.items).toEqual([]);
        expect(ctx.processedTasks).toHaveLength(1);
        expect(ctx.processedTasks[0]!.status).toBe('duplicate');
        expect(getHash).toHaveBeenCalledWith(
            'https://example.test',
            'deadbeef',
        );
    });
});
