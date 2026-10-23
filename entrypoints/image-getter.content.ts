import { uuidv4 } from 'uuidv7';

export const getImageBase64 = (img: HTMLImageElement): Promise<string> => {
    if (img.complete) {
        // Already finished loading: drawing now avoids hanging on an
        // `onload` that will never fire again (e.g. setting `crossOrigin`
        // below does not reload cached images).
        return finishImageRender(img);
    }

    return new Promise<string>((resolve, reject) => {
        const onLoad = () => {
            cleanup();
            finishImageRender(img).then(resolve, reject);
        };
        const onError = (error: unknown) => {
            cleanup();
            console.error('Image load error:', error);
            reject(new Error('Failed to load image'));
        };
        const cleanup = () => {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onError);
        };

        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
        if (img.crossOrigin === null) {
            img.crossOrigin = 'anonymous';
        }
        // The image may have finished (or failed) while listeners were
        // being attached; settle synchronously instead of hanging.
        if (img.complete) {
            cleanup();
            if (img.naturalWidth > 0) {
                finishImageRender(img).then(resolve, reject);
            } else {
                reject(new Error('Failed to load image'));
            }
        }
    });
};

const finishImageRender = async (img: HTMLImageElement): Promise<string> => {
    if (img.naturalWidth === 0) {
        throw new Error('Failed to load image');
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        canvas.remove();
        throw new Error('Failed to get canvas context');
    }
    try {
        ctx.rect(0, 0, img.naturalWidth, img.naturalHeight);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/jpeg', 1);
    } catch (error) {
        // Most commonly a CORS-tainted canvas.
        throw new Error(
            `Failed to read image data: ${error instanceof Error ? error.message : error}`,
        );
    } finally {
        canvas.remove();
    }
};

const processImage = async (el: HTMLImageElement): Promise<string> => {
    try {
        const tmpFunctionName = `_${uuidv4()}`;
        // @ts-expect-error
        window[tmpFunctionName] = getImageBase64;
        // @ts-expect-error
        const dataUrl = await window[tmpFunctionName](el);
        // @ts-expect-error
        delete window[tmpFunctionName];
        return dataUrl;
    } catch (error) {
        console.error('Error getting image base64:', error);
        throw new Error(`Failed to get image: ${error}`);
    }
};

export const resolveSelectorTarget = (
    selector: string,
): HTMLImageElement | undefined => {
    let el: HTMLImageElement | undefined;
    selector.split('::').forEach((segment, i) => {
        if (i === 0) {
            el =
                (document.querySelector(segment) as HTMLImageElement) ??
                undefined;
        } else {
            el = el?.shadowRoot?.querySelector(segment) as HTMLImageElement;
        }
    });
    return el ?? undefined;
};

export const messageHandlerMenus = async (
    targetElementId: number,
): Promise<string> => {
    const el = browser.contextMenus.getTargetElement(
        targetElementId,
    ) as HTMLImageElement;
    if (!el) {
        throw new Error('No target element found');
    }
    return processImage(el);
};

export const messageHandlerSelector = async (
    selector: string,
): Promise<string> => {
    const el = resolveSelectorTarget(selector);
    if (!el) {
        throw new Error('No target element found');
    }
    return processImage(el);
};

export default defineContentScript({
    matches: ['*://*/*'],
    main() {
        const listener = ({
            type,
            targetElementId,
            selector,
        }: {
            type: string;
            targetElementId: number;
            selector: string;
        }) => {
            console.log('Received message:', type, targetElementId);
            if (type === 'getImageMenusBase64') {
                return messageHandlerMenus(targetElementId);
            } else if (type === 'getImageSelectorBase64') {
                return messageHandlerSelector(selector);
            }
        };
        browser.runtime.onMessage.addListener(listener);
    },
});
