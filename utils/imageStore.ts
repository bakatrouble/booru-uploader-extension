import { type IDBPDatabase, openDB } from 'idb';

export const IMAGE_STORE = 'images';
export const IMAGE_DB_VERSION = 2;

/** Thumbnails live next to the full blob under a suffixed key. */
export const thumbKeyFor = (id: string) => `${id}:thumb`;

let dbPromise: Promise<IDBPDatabase> | undefined;

/**
 * Opens the shared image database. Same store and version as the
 * background script, so the popup can read thumbnails directly.
 */
export const getImageDb = (): Promise<IDBPDatabase> =>
    (dbPromise ??= openDB('booru-uploader', IMAGE_DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(IMAGE_STORE)) {
                db.createObjectStore(IMAGE_STORE);
            }
        },
    }));

/**
 * Reads a task's thumbnail, falling back to the full blob (e.g. failed
 * tasks kept for retry). Returns `null` when nothing is stored.
 */
export const readTaskThumbnail = async (id: string): Promise<Blob | null> => {
    try {
        const db = await getImageDb();
        const thumb = await db.get(IMAGE_STORE, thumbKeyFor(id));
        if (thumb instanceof Blob) return thumb;
        const full = await db.get(IMAGE_STORE, id);
        return full instanceof Blob ? full : null;
    } catch {
        return null;
    }
};
