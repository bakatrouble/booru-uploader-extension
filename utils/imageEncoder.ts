// Upload-side JPEG rendering. Rasterizing a full-size booru image and
// JPEG-encoding it on the main thread freezes the page for seconds on
// large images, so encoding runs in an extension-origin worker via
// OffscreenCanvas. The worker file lives in public/ and is exposed
// through web_accessible_resources, so page CSP does not apply to it.
// The worker path is the only path: anything goes wrong (no Worker
// support, tainted canvas, worker error, timeout), the upload fails
// loudly instead of freezing the page with a synchronous render.
//
// Unlike the lightbox encoder this returns raw bytes for the
// `photoArrayBuffer` upload method instead of a data URL.
export const DIMENSION_SUM_CAP = 10000;

export const ENCODE_WORKER_TIMEOUT_MS = 30_000;

// Scale dimensions to fit width + height within the cap, preserving aspect
// ratio. Huge images only get slower and heavier past this point; the
// uploader endpoint never needs more.
export const fitDimensionSum = (
    width: number,
    height: number,
    cap: number = DIMENSION_SUM_CAP,
): { width: number; height: number } => {
    if (width + height <= cap) {
        return { width, height };
    }
    const scale = cap / (width + height);
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
};

const renderInWorker = (
    bitmap: ImageBitmap,
    width: number,
    height: number,
): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
        const worker = new Worker(browser.runtime.getURL('/encode-worker.js'));
        const timeout = setTimeout(() => {
            worker.terminate();
            reject(new Error('JPEG worker timed out'));
        }, ENCODE_WORKER_TIMEOUT_MS);
        worker.onmessage = (e: MessageEvent) => {
            clearTimeout(timeout);
            worker.terminate();
            if (e.data?.ok) {
                resolve(e.data.buffer as ArrayBuffer);
            } else {
                reject(new Error(e.data?.message ?? 'JPEG worker failed'));
            }
        };
        worker.onerror = (e: ErrorEvent) => {
            clearTimeout(timeout);
            worker.terminate();
            reject(e.error ?? new Error('JPEG worker error'));
        };
        worker.postMessage({ bitmap, width, height }, [bitmap]);
    });

export const renderImageToJpegBuffer = async (
    el: HTMLImageElement,
): Promise<ArrayBuffer> => {
    const { width, height } = fitDimensionSum(
        el.naturalWidth,
        el.naturalHeight,
    );
    if (
        typeof Worker === 'undefined' ||
        typeof createImageBitmap === 'undefined'
    ) {
        throw new Error('worker encoding unsupported');
    }
    const bitmap = await createImageBitmap(el);
    return renderInWorker(bitmap, width, height);
};
