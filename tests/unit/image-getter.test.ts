import { describe, expect, it, vi } from 'vitest';
import {
    getImageBase64,
    messageHandlerMenus,
    messageHandlerSelector,
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

describe('message handlers', () => {
    it('messageHandlerSelector throws when the target is missing', async () => {
        mountDom();
        await expect(messageHandlerSelector('#missing')).rejects.toThrow(
            'No target element found',
        );
    });

    it('messageHandlerMenus throws when there is no target element', async () => {
        mountDom();
        stubBrowser.contextMenus.getTargetElement.mockReturnValueOnce(null);
        await expect(messageHandlerMenus(123)).rejects.toThrow(
            'No target element found',
        );
    });
});

describe('getImageBase64', () => {
    const fakeContext = () => ({
        rect: vi.fn(),
        fill: vi.fn(),
        drawImage: vi.fn(),
        fillStyle: '',
    });

    const stubCanvas = (toDataURL: () => string) => {
        vi.spyOn(
            window.HTMLCanvasElement.prototype,
            'getContext',
        ).mockReturnValue(fakeContext() as never);
        vi.spyOn(
            window.HTMLCanvasElement.prototype,
            'toDataURL',
        ).mockImplementation(toDataURL as never);
    };

    const loadedImage = () => {
        const img = document.createElement('img');
        Object.defineProperty(img, 'complete', { value: true });
        Object.defineProperty(img, 'naturalWidth', { value: 4 });
        Object.defineProperty(img, 'naturalHeight', { value: 3 });
        return img;
    };

    it('draws an already-loaded image without waiting for events', async () => {
        stubCanvas(() => 'data:image/jpeg;base64,AAA');
        const img = loadedImage();

        await expect(getImageBase64(img)).resolves.toBe(
            'data:image/jpeg;base64,AAA',
        );
    });

    it('rejects a completed but broken image instead of hanging', async () => {
        const img = document.createElement('img');
        Object.defineProperty(img, 'complete', { value: true });
        Object.defineProperty(img, 'naturalWidth', { value: 0 });

        await expect(getImageBase64(img)).rejects.toThrow(
            'Failed to load image',
        );
    });

    it('waits for load on images still in flight', async () => {
        stubCanvas(() => 'data:image/jpeg;base64,AAA');
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        // Simulate a genuinely in-flight image: jsdom reports
        // `complete` for src-less images, real loaders do not.
        Object.defineProperty(img, 'complete', { value: false });
        Object.defineProperty(img, 'naturalWidth', { value: 4 });
        Object.defineProperty(img, 'naturalHeight', { value: 3 });

        const pending = getImageBase64(img);
        img.dispatchEvent(new Event('load'));
        await expect(pending).resolves.toBe('data:image/jpeg;base64,AAA');
    });

    it('enables CORS and reports load errors as rejections', async () => {
        const img = document.createElement('img');
        expect(img.crossOrigin).toBeNull();
        Object.defineProperty(img, 'complete', { value: false });

        const pending = getImageBase64(img);
        expect(img.crossOrigin).toBe('anonymous');
        img.dispatchEvent(new Event('error'));
        await expect(pending).rejects.toThrow('Failed to load image');
    });

    it('surfaces tainted canvases as rejections, not hangs', async () => {
        stubCanvas(() => {
            throw new DOMException(
                'The operation is insecure.',
                'SecurityError',
            );
        });
        const img = loadedImage();

        await expect(getImageBase64(img)).rejects.toThrow(
            'Failed to read image data',
        );
    });
});
