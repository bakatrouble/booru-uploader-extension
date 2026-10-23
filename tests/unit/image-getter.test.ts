import { describe, expect, it, vi } from 'vitest';
import {
    messageHandlerMenusBuffer,
    messageHandlerSelectorBuffer,
    resolveSelectorTarget,
} from '@/entrypoints/image-getter.content';
import { stubBrowser } from './setup';

const mountDom = () => {
    document.body.innerHTML =
        '<img id="plain" src="https://example.test/plain.jpg"><div id="host"></div>';
    const host = document.getElementById('host')!;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<img id="inner" src="https://example.test/inner.jpg">';
    return { host, shadow };
};

class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((e: unknown) => void) | null = null;
    posted: unknown[] = [];
    terminated = false;

    constructor(public url: string) {
        FakeWorker.instances.push(this);
    }

    postMessage(message: unknown, transfer?: unknown) {
        this.posted.push([message, transfer]);
    }

    terminate() {
        this.terminated = true;
    }
}

const stubWorkerEnv = () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => ({})),
    );
    FakeWorker.instances = [];
};

describe('resolveSelectorTarget', () => {
    it('resolves a plain selector', () => {
        mountDom();
        expect(resolveSelectorTarget('#plain')?.id).toBe('plain');
    });

    it('walks through shadow roots on :: segments', () => {
        mountDom();
        expect(resolveSelectorTarget('#host::#inner')?.id).toBe('inner');
    });

    it('returns undefined when nothing matches', () => {
        mountDom();
        expect(resolveSelectorTarget('#missing')).toBeUndefined();
        expect(resolveSelectorTarget('#host::#missing')).toBeUndefined();
        expect(resolveSelectorTarget('#missing::#inner')).toBeUndefined();
    });
});

describe('ArrayBuffer message handlers', () => {
    it('menus and selector handlers throw when the target is missing', async () => {
        mountDom();
        stubBrowser.menus.getTargetElement.mockReturnValueOnce(null);
        await expect(messageHandlerMenusBuffer(123)).rejects.toThrow(
            'No target element found',
        );
        await expect(messageHandlerSelectorBuffer('#missing')).rejects.toThrow(
            'No target element found',
        );
    });

    it('menus handler renders off the main thread without legacy fallback', async () => {
        // No Worker in jsdom: strict mode rejects before touching canvas.
        const toDataURL = vi.fn(() => 'data:image/jpeg;base64,QUJD');
        vi.spyOn(
            window.HTMLCanvasElement.prototype,
            'toDataURL',
        ).mockImplementation(toDataURL as never);
        const img = document.createElement('img');
        stubBrowser.menus.getTargetElement.mockReturnValueOnce(img);

        await expect(messageHandlerMenusBuffer(123)).rejects.toThrow(
            'worker encoding unsupported',
        );
        expect(toDataURL).not.toHaveBeenCalled();
        vi.restoreAllMocks();
    });

    it('menus handler resolves worker-encoded bytes', async () => {
        stubWorkerEnv();
        try {
            const img = document.createElement('img');
            stubBrowser.menus.getTargetElement.mockReturnValueOnce(img);

            const pending = messageHandlerMenusBuffer(123);
            await vi.waitFor(() =>
                expect(FakeWorker.instances).toHaveLength(1),
            );
            const buffer = new Uint8Array([1, 2, 3]).buffer;
            FakeWorker.instances[0]!.onmessage!({
                data: { ok: true, buffer },
            });
            await expect(pending).resolves.toBe(buffer);
        } finally {
            vi.unstubAllGlobals();
            vi.stubGlobal('browser', stubBrowser);
            vi.restoreAllMocks();
        }
    });

    it('selector handler resolves worker-encoded bytes', async () => {
        stubWorkerEnv();
        try {
            mountDom();

            const pending = messageHandlerSelectorBuffer('#plain');
            await vi.waitFor(() =>
                expect(FakeWorker.instances).toHaveLength(1),
            );
            const buffer = new Uint8Array([4, 5, 6]).buffer;
            FakeWorker.instances[0]!.onmessage!({
                data: { ok: true, buffer },
            });
            const result = await pending;
            expect(result).toBeInstanceOf(ArrayBuffer);
            expect(Array.from(new Uint8Array(result))).toEqual([4, 5, 6]);
        } finally {
            vi.unstubAllGlobals();
            vi.stubGlobal('browser', stubBrowser);
            vi.restoreAllMocks();
        }
    });

    it('worker errors reject instead of falling back', async () => {
        stubWorkerEnv();
        try {
            mountDom();

            const pending = messageHandlerSelectorBuffer('#plain');
            await vi.waitFor(() =>
                expect(FakeWorker.instances).toHaveLength(1),
            );
            FakeWorker.instances[0]!.onmessage!({
                data: { ok: false, message: 'boom' },
            });
            await expect(pending).rejects.toThrow('boom');
        } finally {
            vi.unstubAllGlobals();
            vi.stubGlobal('browser', stubBrowser);
            vi.restoreAllMocks();
        }
    });
});
