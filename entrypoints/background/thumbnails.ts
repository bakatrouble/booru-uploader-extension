import type { IDBPDatabase } from 'idb';
import { IMAGE_STORE, thumbKeyFor } from '@/utils/imageStore';

export const THUMBNAIL_MAX_EDGE = 256;
export const THUMBNAIL_MIME = 'image/jpeg';
export const THUMBNAIL_QUALITY = 0.7;

export type ImageStore = Pick<IDBPDatabase, 'get' | 'put' | 'delete'>;

/**
 * Downscales an image blob so its longest edge fits `maxEdge`, encoded
 * as JPEG. Returns the original blob when downscaling is unavailable
 * (missing APIs) or unnecessary (already small enough).
 */
export const makeThumbnail = async (
    blob: Blob,
    maxEdge: number = THUMBNAIL_MAX_EDGE,
): Promise<Blob> => {
    try {
        if (
            typeof createImageBitmap !== 'function' ||
            typeof OffscreenCanvas !== 'function'
        ) {
            return blob;
        }
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(
            1,
            maxEdge / Math.max(bitmap.width, bitmap.height),
        );
        if (scale >= 1) {
            bitmap.close();
            return blob;
        }
        const canvas = new OffscreenCanvas(
            Math.max(1, Math.round(bitmap.width * scale)),
            Math.max(1, Math.round(bitmap.height * scale)),
        );
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            bitmap.close();
            return blob;
        }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        return await canvas.convertToBlob({
            type: THUMBNAIL_MIME,
            quality: THUMBNAIL_QUALITY,
        });
    } catch {
        return blob;
    }
};

/**
 * Generates the thumbnail for a stored full-size blob and keeps it
 * under the thumbnail key. Runs at intake so queued tasks already
 * have something to display.
 */
export const storeThumbnail = async (
    db: ImageStore | undefined,
    key: string,
): Promise<void> => {
    try {
        const stored = await db?.get(IMAGE_STORE, key);
        if (stored instanceof Blob) {
            await db?.put(
                IMAGE_STORE,
                await makeThumbnail(stored),
                thumbKeyFor(key),
            );
        }
    } catch (e) {
        console.error('Error storing thumbnail:', e);
    }
};

/** Deletes the full-size blob, keeping the thumbnail. */
export const deleteFullBlob = async (
    db: ImageStore | undefined,
    key: string,
): Promise<void> => {
    try {
        await db?.delete(IMAGE_STORE, key);
    } catch (e) {
        console.error('Error deleting stored image:', e);
    }
};

/** Deletes everything stored for a task (full blob and thumbnail). */
export const deleteStoredBlobs = async (
    db: ImageStore | undefined,
    key: string,
): Promise<void> => {
    await deleteFullBlob(db, key);
    try {
        await db?.delete(IMAGE_STORE, thumbKeyFor(key));
    } catch (e) {
        console.error('Error deleting stored thumbnail:', e);
    }
};
