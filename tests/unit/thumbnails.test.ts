import { describe, expect, it, vi } from 'vitest';
import { makeThumbnail } from '@/entrypoints/background/thumbnails';

describe('makeThumbnail', () => {
    it('returns the original blob without imaging APIs', async () => {
        const blob = new Blob(['pixels'], { type: 'image/png' });
        await expect(makeThumbnail(blob)).resolves.toBe(blob);
    });

    it('downscales large images to JPEG', async () => {
        const drawImage = vi.fn();
        const convertToBlob = vi.fn(
            async () => new Blob(['thumb'], { type: 'image/jpeg' }),
        );
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn(async () => ({
                width: 800,
                height: 600,
                close: vi.fn(),
            })),
        );
        vi.stubGlobal(
            'OffscreenCanvas',
            vi.fn(function (this: unknown, width: number, height: number) {
                return {
                    width,
                    height,
                    getContext: () => ({ drawImage }),
                    convertToBlob,
                };
            }),
        );

        const blob = new Blob(['pixels'], { type: 'image/png' });
        const thumb = await makeThumbnail(blob);

        expect(thumb.type).toBe('image/jpeg');
        const Canvas = OffscreenCanvas as unknown as ReturnType<typeof vi.fn>;
        expect(Canvas).toHaveBeenCalledWith(256, 192);
        expect(convertToBlob).toHaveBeenCalledWith({
            type: 'image/jpeg',
            quality: 0.7,
        });
        vi.unstubAllGlobals();
    });

    it('keeps small images as-is', async () => {
        const convertToBlob = vi.fn();
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn(async () => ({ width: 100, height: 50, close: vi.fn() })),
        );
        const Canvas = vi.fn(() => ({
            getContext: () => null,
            convertToBlob,
        }));
        vi.stubGlobal('OffscreenCanvas', Canvas);

        const blob = new Blob(['pixels'], { type: 'image/png' });
        await expect(makeThumbnail(blob)).resolves.toBe(blob);
        expect(Canvas).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
