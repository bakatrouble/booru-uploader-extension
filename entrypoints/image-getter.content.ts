import { uuidv4 } from 'uuidv7';

const getImageBase64 = (img: HTMLImageElement): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw new Error('Failed to get canvas context');


    return new Promise<string>((resolve, reject) => {
        const callback = () => {
            ctx.rect(0, 0, img.naturalWidth, img.naturalHeight);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 1);
            resolve(dataUrl);
            canvas.remove();
        }

        if (img.crossOrigin === null) {
            img.onload = callback;
            img.onerror = (error: any) => {
                console.error('Image load error:', error);
                reject(new Error('Failed to load image'));
            }
            img.crossOrigin = 'anonymous';
        } else {
            callback();
        }
    });
}

const processImage = async (el: HTMLImageElement): Promise<string> => {
    try {
        const tmpFunctionName = `_${uuidv4()}`;
        // @ts-ignore
        window[tmpFunctionName] = getImageBase64;
        // @ts-ignore
        const dataUrl = await window[tmpFunctionName](el);
        // @ts-ignore
        delete window[tmpFunctionName];
        return dataUrl;
    } catch (error) {
        console.error('Error getting image base64:', error);
        throw new Error(`Failed to get image: ${error}`);
    }
}

const messageHandlerMenus = async (targetElementId: number): Promise<string> => {
    const el = browser.menus.getTargetElement(targetElementId) as HTMLImageElement;
    if (!el) {
        throw new Error('No target element found');
    }
    return processImage(el);
}

const messageHandlerSelector = async (selector: string): Promise<string> => {
    let el: HTMLImageElement | undefined;
    selector.split('::').forEach((segment, i) => {
        if (i === 0) {
            el = document.querySelector(segment) as HTMLImageElement ?? undefined;
        } else {
            el = el?.shadowRoot?.querySelector(segment) as HTMLImageElement;
        }
    });
    if (!el) {
        throw new Error('No target element found');
    }
    return processImage(el);
}

export default defineContentScript({
    matches: ['*://*/*'],
    main() {
        const listener = ({ type, targetElementId, selector }: { type: string, targetElementId: number, selector: string }) => {
            console.log('Received message:', type, targetElementId);
            if (type === 'getImageMenusBase64') {
                return messageHandlerMenus(targetElementId);
            } else if (type === 'getImageSelectorBase64') {
                return messageHandlerSelector(selector);
            }
        };
        browser.runtime.onMessage.addListener(listener);
    }
});
