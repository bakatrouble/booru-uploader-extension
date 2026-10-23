export const HASH_TIMEOUT_MS = 30_000;

export type HashWorker = Pick<
    Worker,
    'postMessage' | 'addEventListener' | 'removeEventListener'
>;

/**
 * Computes the perceptual hash of an image via the hasher worker.
 * The image bytes are transferred as a Uint8Array view (not copied)
 * to the worker — the wasm glue requires a view and silently hashes
 * an empty slice for a bare ArrayBuffer. If the worker does not answer
 * in time, rejects instead of hanging forever.
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
                // The wasm glue requires a Uint8Array view — a bare
                // ArrayBuffer silently becomes an empty slice and Rust
                // rejects it as an unknown format. Transfer the view's
                // buffer so the worker still receives the bytes by move,
                // and the received view stays usable.
                const bytes = new Uint8Array(buffer);
                worker.postMessage({ id, buffer: bytes }, [bytes.buffer]);
            }),
    );
