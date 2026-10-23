import { uuidv4 } from 'uuidv7';
import { renderImageToJpegBuffer } from '@/utils/imageEncoder';

const processImageToBuffer = async (
    el: HTMLImageElement,
): Promise<ArrayBuffer> => {
    try {
        const tmpFunctionName = `_${uuidv4()}`;
        // @ts-expect-error
        window[tmpFunctionName] = renderImageToJpegBuffer;
        // @ts-expect-error
        const buffer = await window[tmpFunctionName](el);
        // @ts-expect-error
        delete window[tmpFunctionName];
        return buffer as ArrayBuffer;
    } catch (error) {
        console.error('Error getting image buffer:', error);
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

export const messageHandlerMenusBuffer = async (
    targetElementId: number,
): Promise<ArrayBuffer> => {
    const el = browser.menus.getTargetElement(
        targetElementId,
    ) as HTMLImageElement;
    if (!el) {
        throw new Error('No target element found');
    }
    // No legacy fallback here: freezing the page on a huge image is
    // worse than failing the upload.
    return processImageToBuffer(el);
};

export const messageHandlerSelectorBuffer = async (
    selector: string,
): Promise<ArrayBuffer> => {
    const el = resolveSelectorTarget(selector);
    if (!el) {
        throw new Error('No target element found');
    }
    return processImageToBuffer(el);
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
            if (type === 'getImageMenusArrayBuffer') {
                return messageHandlerMenusBuffer(targetElementId);
            } else if (type === 'getImageSelectorArrayBuffer') {
                return messageHandlerSelectorBuffer(selector);
            }
        };
        browser.runtime.onMessage.addListener(listener);
    },
});
