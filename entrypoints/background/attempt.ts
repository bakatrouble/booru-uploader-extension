import type { UploadResponse, UploadTask } from './types';

export const MAX_UPLOAD_RETRIES = 10;
export const UPLOAD_TIMEOUT_MS = 60_000;

/** Minimal upload surface the background worker needs. */
export interface UploadEndpoint {
    /** Raw file bytes → `POST {apiRoot}/upload` (`application/octet-stream`). */
    postFile(blob: Blob): Promise<UploadResponse>;
    /** Remote URL ingest → `POST {apiRoot}/upload-url` (`{"url": ...}`). */
    postUrl(url: string): Promise<UploadResponse>;
}

export type BlobProvider = () => Promise<Blob | null | undefined>;

export type AttemptOutcome = {
    outcome: 'complete' | 'duplicate' | 'failed';
    hash?: string;
    uploadId?: string;
    retries: number;
};

/** Exponential backoff: 1s, 2s, 4s, … capped at 30s. */
export const defaultRetryDelayMs = (retryIndex: number): number =>
    Math.min(1000 * 2 ** retryIndex, 30_000);

export const withRetries = async <T>(
    operation: (attempt: number) => Promise<T>,
    opts: {
        maxRetries: number;
        delayForAttempt?: (retryIndex: number) => number;
    },
): Promise<{ result: T; retries: number }> => {
    const delayForAttempt = opts.delayForAttempt ?? defaultRetryDelayMs;
    let lastError: unknown;
    for (let attempt = 0; ; attempt++) {
        try {
            const result = await operation(attempt);
            return { result, retries: attempt };
        } catch (e) {
            lastError = e;
            if (attempt >= opts.maxRetries) break;
            await new Promise<void>((resolve) => {
                setTimeout(resolve, delayForAttempt(attempt));
            });
        }
    }
    throw lastError;
};

/**
 * Uploads one task, retrying transient (thrown) errors up to
 * `maxRetries` times. Server-reported failures and missing blobs are
 * terminal and do not retry.
 */
export const attemptUpload = async (
    task: UploadTask,
    endpoint: UploadEndpoint,
    getBlob: BlobProvider,
    opts: {
        maxRetries?: number;
        delayForAttempt?: (retryIndex: number) => number;
    } = {},
): Promise<AttemptOutcome> => {
    const maxRetries = opts.maxRetries ?? MAX_UPLOAD_RETRIES;
    try {
        const { result, retries } = await withRetries(
            async () => {
                let response: UploadResponse;
                switch (task.type) {
                    case 'photoFile': {
                        const blob = await getBlob();
                        if (!blob) return { outcome: 'failed' as const };
                        response = await endpoint.postFile(blob);
                        break;
                    }
                    case 'photoUrl':
                    case 'gif': {
                        response = await endpoint.postUrl(task.url);
                        break;
                    }
                }
                if (response.status === 'duplicate') {
                    return {
                        outcome: 'duplicate' as const,
                        hash: response.hash,
                    };
                }
                if (response.status === 'ok') {
                    return {
                        outcome: 'complete' as const,
                        hash: response.hash,
                        uploadId: response.upload_id || undefined,
                    };
                }
                return { outcome: 'failed' as const };
            },
            { maxRetries, delayForAttempt: opts.delayForAttempt },
        );
        return { ...result, retries };
    } catch {
        return { outcome: 'failed', retries: maxRetries };
    }
};
