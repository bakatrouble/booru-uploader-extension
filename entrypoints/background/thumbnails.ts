import type { IDBPDatabase } from 'idb';

export const THUMBNAIL_MAX_EDGE = 256;
export const THUMBNAIL_MIME = 'image/jpeg';
export const THUMBNAIL_QUALITY = 0.7;

const STORE_NAME = 'images' as const;

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

type ImageStore = Pick<IDBPDatabase, 'get' | 'put' | 'delete'>;

/**
 * Replaces the stored full-size blob with a thumbnail. Failed tasks
 * keep their full blob so a later retry can upload it.
 */
export const storeThumbnail = async (
    db: ImageStore | undefined,
    key: string,
): Promise<void> => {
    try {
        const stored = await db?.get(STORE_NAME, key);
        if (stored instanceof Blob) {
            await db?.put(STORE_NAME, await makeThumbnail(stored), key);
        }
    } catch (e) {
        console.error('Error storing thumbnail:', e);
    }
};

/** Deletes whatever is stored for a task (full blob or thumbnail). */
export const deleteStoredBlob = async (
    db: ImageStore | undefined,
    key: string,
): Promise<void> => {
    try {
        await db?.delete(STORE_NAME, key);
    } catch (e) {
        console.error('Error deleting stored image:', e);
    }
};
