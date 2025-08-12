import initWasm, { imagehash } from 'imagehash-rs';
import imagehashWasmUrl from 'imagehash-rs/imagehash_bg.wasm?url';

// fix "background is not defined" error?
const background = undefined;

onmessage = (e: MessageEvent<{ id: string, buffer: Uint8Array } | 'init'>) => {
    if (e.data === 'init') {
        initWasm({
            module_or_path: new URL(imagehashWasmUrl),
        })
            .then(() => 'wasm init success')
            .catch(() => console.error('wasm init error', e));
        return;
    }
    const { id, buffer } = e.data;
    const hash = imagehash(buffer);
    postMessage({ id, hash, background });
}
