import initWasm, { imagehash } from 'imagehash-rs';
import imagehashWasmUrl from 'imagehash-rs/imagehash_bg.wasm?url&no-inline';

// fix "background is not defined" error?
const background = undefined;

globalThis.onmessage = (
    e: MessageEvent<{ id: string; buffer: Uint8Array } | 'init'>,
) => {
    if (e.data === 'init') {
        // imagehashWasmUrl is an emitted file thanks to `?url&no-inline`
        // (entrypoints build in lib mode, which ignores assetsInlineLimit
        // and would otherwise inline the ~1MB binary as base64 twice).
        // Resolve it against this worker's own URL.
        initWasm({
            module_or_path: new URL(imagehashWasmUrl, import.meta.url),
        })
            .then(() => 'wasm init success')
            .catch(() => console.error('wasm init error', e));
        return;
    }
    const { id, buffer } = e.data;
    const hash = imagehash(buffer);
    postMessage({ id, hash, background });
};
