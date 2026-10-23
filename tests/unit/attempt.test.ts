import { describe, expect, it, vi } from 'vitest';
import {
    attemptUpload,
    defaultRetryDelayMs,
    type UploadEndpoint,
    withRetries,
} from '@/entrypoints/background/attempt';
import type { UploadTask } from '@/entrypoints/background/types';

const okResponse = { status: 'ok', upload_id: 'u1', hash: 'h1' } as const;

const makeTask = (overrides: Partial<UploadTask> = {}): UploadTask =>
    ({
        id: 't1',
        endpoint: 'https://example.test',
        retries: 0,
        status: 'queued',
        type: 'photoUrl',
        url: 'https://example.test/i.jpg',
        ...overrides,
    }) as UploadTask;

const makeEndpoint = (impl: Partial<UploadEndpoint>): UploadEndpoint => ({
    postPhoto: vi.fn(async () => ({ ...okResponse })),
    postPhotoUrl: vi.fn(async () => ({ ...okResponse })),
    postGif: vi.fn(async () => ({ ...okResponse })),
    ...impl,
});

describe('withRetries', () => {
    it('returns immediately when the first attempt succeeds', async () => {
        const delays: number[] = [];
        const { result, retries } = await withRetries(async () => 'done', {
            maxRetries: 3,
            delayForAttempt: (i) => {
                delays.push(i);
                return 0;
            },
        });
        expect(result).toBe('done');
        expect(retries).toBe(0);
        expect(delays).toEqual([]);
    });

    it('retries until success and counts attempts', async () => {
        let calls = 0;
        const { result, retries } = await withRetries(
            async () => {
                calls += 1;
                if (calls < 3) throw new Error('flaky');
                return 'done';
            },
            { maxRetries: 10, delayForAttempt: () => 0 },
        );
        expect(result).toBe('done');
        expect(retries).toBe(2);
        expect(calls).toBe(3);
    });

    it('rethrows after exhausting retries', async () => {
        const delays: number[] = [];
        await expect(
            withRetries(
                async () => {
                    throw new Error('down');
                },
                {
                    maxRetries: 2,
                    delayForAttempt: (i) => {
                        delays.push(i);
                        return 0;
                    },
                },
            ),
        ).rejects.toThrow('down');
        expect(delays).toEqual([0, 1]);
    });

    it('backs off exponentially with a cap', () => {
        expect(defaultRetryDelayMs(0)).toBe(1000);
        expect(defaultRetryDelayMs(3)).toBe(8000);
        expect(defaultRetryDelayMs(10)).toBe(30_000);
    });
});

describe('attemptUpload', () => {
    it('uploads a photo URL without retries on success', async () => {
        const postPhotoUrl = vi.fn(async () => ({ ...okResponse }));
        const outcome = await attemptUpload(
            makeTask(),
            makeEndpoint({ postPhotoUrl }),
            async () => null,
            { delayForAttempt: () => 0 },
        );
        expect(outcome).toEqual({
            outcome: 'complete',
            hash: 'h1',
            retries: 0,
        });
        expect(postPhotoUrl).toHaveBeenCalledTimes(1);
    });

    it('reports duplicates with the server hash', async () => {
        const postGif = vi.fn(
            async () =>
                ({
                    status: 'duplicate',
                    hash: 'known',
                }) as const,
        );
        const outcome = await attemptUpload(
            makeTask({ type: 'gif', url: 'https://example.test/a.gif' }),
            makeEndpoint({ postGif }),
            async () => null,
            { delayForAttempt: () => 0 },
        );
        expect(outcome).toEqual({
            outcome: 'duplicate',
            hash: 'known',
            retries: 0,
        });
    });

    it('treats server errors as terminal without retrying', async () => {
        const postPhotoUrl = vi.fn(
            async () =>
                ({
                    status: 'error',
                    message: 'bad',
                }) as const,
        );
        const outcome = await attemptUpload(
            makeTask(),
            makeEndpoint({ postPhotoUrl }),
            async () => null,
            { delayForAttempt: () => 0 },
        );
        expect(outcome).toEqual({ outcome: 'failed', retries: 0 });
        expect(postPhotoUrl).toHaveBeenCalledTimes(1);
    });

    it('retries thrown errors and uploads the file blob', async () => {
        const blob = new Blob(['pixels'], { type: 'image/jpeg' });
        const postPhoto = vi.fn(async (_body: FormData) => ({
            ...okResponse,
        }));
        let calls = 0;
        const bodies: FormData[] = [];
        const flaky = vi.fn(async (body: FormData) => {
            calls += 1;
            if (calls === 1) throw new Error('timeout');
            bodies.push(body);
            return postPhoto(body);
        });
        const outcome = await attemptUpload(
            makeTask({ type: 'photoFile' }),
            makeEndpoint({ postPhoto: flaky as never }),
            async () => blob,
            { maxRetries: 3, delayForAttempt: () => 0 },
        );
        expect(outcome).toEqual({
            outcome: 'complete',
            hash: 'h1',
            retries: 1,
        });
        expect(bodies).toHaveLength(1);
        expect(bodies[0]!.get('upload')).toBeInstanceOf(Blob);
    });

    it('fails after the retry cap without further attempts', async () => {
        const postPhotoUrl = vi.fn(async () => {
            throw new Error('down');
        });
        const outcome = await attemptUpload(
            makeTask(),
            makeEndpoint({ postPhotoUrl }),
            async () => null,
            { maxRetries: 3, delayForAttempt: () => 0 },
        );
        expect(outcome).toEqual({ outcome: 'failed', retries: 3 });
        expect(postPhotoUrl).toHaveBeenCalledTimes(4);
    });

    it('fails fast when the file blob is gone', async () => {
        const postPhoto = vi.fn(async () => ({ ...okResponse }));
        const outcome = await attemptUpload(
            makeTask({ type: 'photoFile' }),
            makeEndpoint({ postPhoto }),
            async () => null,
            { delayForAttempt: () => 0 },
        );
        expect(outcome).toEqual({ outcome: 'failed', retries: 0 });
        expect(postPhoto).not.toHaveBeenCalled();
    });
});
