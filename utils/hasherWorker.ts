import initWasm, { imagehash } from 'imagehash-rs';
import imagehashWasmUrl from 'imagehash-rs/imagehash_bg.wasm?url&no-inline';

// fix "background is not defined" error?
const background = undefined;

// Serializes wasm startup: hash requests that land before `init`
// finishes must wait for it instead of calling into an uninitialized
// module (which throws and — with no reply — surfaces in the caller
// only as a hash timeout).
let ready: Promise<unknown> | null = null;

globalThis.onmessage = async (
    e: MessageEvent<{ id: string; buffer: Uint8Array } | 'init'>,
) => {
    if (e.data === 'init') {
        // imagehashWasmUrl is an emitted file thanks to `?url&no-inline`
        // (entrypoints build in lib mode, which ignores assetsInlineLimit
        // and would otherwise inline the ~1MB binary as base64 twice).
        // Resolve it against this worker's own URL.
        if (!ready) {
            ready = initWasm({
                module_or_path: new URL(imagehashWasmUrl, import.meta.url),
            })
                .then(() => 'wasm init success')
                .catch((err) => {
                    console.error('wasm init error', err);
                    throw err;
                });
        }
        try {
            await ready;
        } catch {
            // Logged above; hash attempts below report it per-message.
        }
        return;
    }
    const { id, buffer } = e.data;
    try {
        if (!ready) {
            // A hash arrived without an `init` (tests, race): start init
            // on demand so we still reply instead of hanging to timeout.
            ready = initWasm({
                module_or_path: new URL(imagehashWasmUrl, import.meta.url),
            });
        }
        await ready;
        const hash = imagehash(buffer);
        postMessage({ id, hash, background });
    } catch (err) {
        // Reply instead of throwing: an uncaught throw leaves the
        // caller hanging until `HASH_TIMEOUT_MS` with a misleading
        // "Hash computation timed out" instead of the real cause
        // (e.g. "Failed to load image from bytes" for unsupported
        // bytes, or a wasm init failure).
        postMessage({
            id,
            error: err instanceof Error ? err.message : String(err),
            background,
        });
    }
};
