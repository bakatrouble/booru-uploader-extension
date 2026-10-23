import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DIMENSION_SUM_CAP,
    fitDimensionSum,
    renderImageToJpegBuffer,
} from '@/utils/imageEncoder';
import { stubBrowser } from './setup';

describe('fitDimensionSum', () => {
    it('leaves small images untouched', () => {
        expect(fitDimensionSum(200, 100)).toEqual({
            height: 100,
            width: 200,
        });
    });

    it('leaves images exactly at the cap untouched', () => {
        expect(fitDimensionSum(6000, 4000)).toEqual({
            height: 4000,
            width: 6000,
        });
    });

    it('scales large images to sum to the cap, keeping aspect', () => {
        // 8000x6000 sums to 14000; scale 10000/14000
        const { height, width } = fitDimensionSum(8000, 6000);
        expect(width + height).toBe(DIMENSION_SUM_CAP);
        expect(width).toBe(5714);
        expect(height).toBe(4286);
    });

    it('handles extreme panoramas without collapsing the short edge', () => {
        const { height, width } = fitDimensionSum(20000, 100);
        expect(width + height).toBe(DIMENSION_SUM_CAP);
        expect(width).toBe(9950);
        expect(height).toBe(50);
    });

    it('never returns a zero edge', () => {
        // degenerate input still yields a drawable canvas
        expect(fitDimensionSum(0, 0)).toEqual({ height: 0, width: 0 });
        expect(fitDimensionSum(30000, 1).height).toBeGreaterThanOrEqual(1);
    });
});

class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    posted: unknown[] = [];
    transfers: unknown[] = [];
    terminated = false;

    constructor(public url: string) {
        FakeWorker.instances.push(this);
    }

    postMessage(message: unknown, transfer?: unknown) {
        this.posted.push(message);
        this.transfers.push(transfer);
    }

    terminate() {
        this.terminated = true;
    }
}

const stubWorkerEnv = (bitmap = {}) => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => bitmap),
    );
    return bitmap;
};

const loadedImage = (width = 8000, height = 6000) => {
    const img = document.createElement('img');
    Object.defineProperty(img, 'naturalWidth', { value: width });
    Object.defineProperty(img, 'naturalHeight', { value: height });
    return img;
};

afterEach(() => {
    vi.unstubAllGlobals();
    // setup.ts stubs the `browser` global for every file; keep it alive.
    vi.stubGlobal('browser', stubBrowser);
    vi.restoreAllMocks();
    FakeWorker.instances = [];
});

describe('renderImageToJpegBuffer', () => {
    it('encodes off the main thread and transfers the bitmap', async () => {
        const bitmap = stubWorkerEnv({ close: vi.fn() });
        const pending = renderImageToJpegBuffer(loadedImage());

        await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
        const worker = FakeWorker.instances[0]!;
        expect(worker.url).toMatch(
            /moz-extension:\/\/test\/+encode-worker\.js$/,
        );
        // Dimensions are capped to the dimension-sum cap.
        expect(worker.posted[0]).toMatchObject({
            width: 5714,
            height: 4286,
        });
        expect(worker.transfers[0]).toEqual([bitmap]);

        const buffer = new Uint8Array([9, 9, 9]).buffer;
        worker.onmessage!({ data: { ok: true, buffer } });
        await expect(pending).resolves.toBe(buffer);
        expect(worker.terminated).toBe(true);
    });

    it('rejects when workers are unavailable instead of rendering inline', async () => {
        expect(typeof Worker).toBe('undefined');
        const toDataURL = vi.fn(() => 'data:image/jpeg;base64,QUJD');
        vi.spyOn(
            window.HTMLCanvasElement.prototype,
            'toDataURL',
        ).mockImplementation(toDataURL as never);

        await expect(renderImageToJpegBuffer(loadedImage())).rejects.toThrow(
            'worker encoding unsupported',
        );
        expect(toDataURL).not.toHaveBeenCalled();
    });

    it('propagates worker errors', async () => {
        stubWorkerEnv();

        const pending = renderImageToJpegBuffer(loadedImage());
        await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
        FakeWorker.instances[0]!.onmessage!({
            data: { ok: false, message: 'boom' },
        });
        await expect(pending).rejects.toThrow('boom');
    });

    it('times out a silent worker instead of hanging', async () => {
        vi.useFakeTimers();
        try {
            stubWorkerEnv();

            const pending = renderImageToJpegBuffer(loadedImage());
            const assertion = expect(pending).rejects.toThrow(
                'JPEG worker timed out',
            );
            await vi.waitFor(() =>
                expect(FakeWorker.instances).toHaveLength(1),
            );
            await vi.advanceTimersByTimeAsync(30_000);
            await assertion;
            expect(FakeWorker.instances[0]!.terminated).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});
