import { base64ToBlob } from 'file64';
import type { IDBPDatabase } from 'idb';
import type { Queue } from '@/utils/queue';
import { trimProcessed } from './taskUtils';
import {
    deleteFullBlob,
    deleteStoredBlobs,
    storeThumbnail,
} from './thumbnails';
import type { UploadTask } from './types';

export type PhotoMessage =
    | {
          method: 'photoBase64';
          data: string;
      }
    | {
          method: 'photoArrayBuffer';
          data: ArrayBuffer;
          mimeType?: string;
      };

/**
 * Turns a photo upload payload into bytes. Base64 is accepted with or
 * without the `data:` prefix (raw payloads are assumed to be JPEG).
 */
export const normalizePhotoInput = async (
    message: PhotoMessage,
): Promise<Blob> => {
    if (message.method === 'photoBase64') {
        const dataUrl = message.data.startsWith('data:')
            ? message.data
            : `data:image/jpeg;base64,${message.data}`;
        return base64ToBlob(dataUrl);
    }
    return new Blob([message.data], {
        type: message.mimeType ?? 'image/jpeg',
    });
};

export interface PhotoIntakeContext {
    db?: IDBPDatabase;
    imageHashes: Record<string, Set<string>>;
    queuedTasks: Queue<UploadTask>;
    processedTasks: UploadTask[];
    computeHash: (blob: Blob) => Promise<string>;
    getHash: (apiKey: string, hash: string) => Promise<boolean>;
}

/**
 * Stores the image bytes alongside a thumbnail generated right away,
 * runs the duplicate check against known hashes, and either records a
 * `duplicate` task or queues the file for upload. Duplicates drop the
 * full blob immediately since they never upload.
 */
export const enqueuePhotoFile = async (
    ctx: PhotoIntakeContext,
    base: Pick<UploadTask, 'id' | 'apiKey' | 'retries' | 'status'>,
    blob: Blob,
    apiKey: string,
): Promise<true | 'duplicate'> => {
    const task = {
        type: 'photoFile',
        ...base,
    } as UploadTask;
    await ctx.db?.put('images', blob, base.id);
    await storeThumbnail(ctx.db, base.id);
    const knownHashes = ctx.imageHashes[apiKey];
    if (knownHashes) {
        const hash = await ctx.computeHash(blob);
        if (
            knownHashes.has(hash.toString()) &&
            (await ctx.getHash(apiKey, hash))
        ) {
            task.status = 'duplicate';
            ctx.processedTasks.unshift(task);
            await deleteFullBlob(ctx.db, base.id);
            for (const evicted of trimProcessed(ctx.processedTasks)) {
                await deleteStoredBlobs(ctx.db, evicted.id);
            }
            return 'duplicate';
        }
    }
    ctx.queuedTasks.put(task);
    return true;
};
