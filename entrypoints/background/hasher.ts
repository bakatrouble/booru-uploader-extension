export const HASH_TIMEOUT_MS = 30_000;

export type HashWorker = Pick<
    Worker,
    'postMessage' | 'addEventListener' | 'removeEventListener'
>;

/**
 * Computes the perceptual hash of an image via the hasher worker.
 * The image buffer is transferred (not copied) to the worker. If the
 * worker does not answer in time, rejects instead of hanging forever —
 * callers must treat this as "unknown, skip dedup".
 */
export const computeHashWithWorker = (
    worker: HashWorker,
    image: Blob,
    timeoutMs: number = HASH_TIMEOUT_MS,
): Promise<string> =>
    image.arrayBuffer().then(
        (buffer) =>
            new Promise<string>((resolve, reject) => {
                const id = `${Date.now()}-${Math.random()}`;
                const timer = setTimeout(() => {
                    worker.removeEventListener('message', listener);
                    reject(new Error('Hash computation timed out'));
                }, timeoutMs);
                const listener = (
                    e: MessageEvent<{ id: string; hash: string }>,
                ) => {
                    if (e.data.id !== id) return;
                    clearTimeout(timer);
                    resolve(e.data.hash);
                    worker.removeEventListener('message', listener);
                };
                worker.addEventListener('message', listener);
                worker.postMessage({ id, buffer }, [buffer]);
            }),
    );
