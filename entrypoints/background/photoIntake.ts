import { base64ToBlob } from 'file64';
import type { IDBPDatabase } from 'idb';
import type { Queue } from '@/utils/queue';
import { trimProcessed } from './taskUtils';
import { deleteStoredBlob, storeThumbnail } from './thumbnails';
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
    getHash: (endpoint: string, hash: string) => Promise<boolean>;
}

/**
 * Stores the image bytes, runs the duplicate check against known
 * hashes, and either records a `duplicate` task or queues the file
 * for upload. Creates exactly one object URL per image.
 */
export const enqueuePhotoFile = async (
    ctx: PhotoIntakeContext,
    base: Pick<UploadTask, 'id' | 'endpoint' | 'retries' | 'status'>,
    blob: Blob,
    endpoint: string,
): Promise<true | 'duplicate'> => {
    const task = {
        type: 'photoFile',
        ...base,
        file: URL.createObjectURL(blob),
    } as UploadTask;
    await ctx.db?.put('images', blob, base.id);
    const knownHashes = ctx.imageHashes[endpoint];
    if (knownHashes) {
        const hash = await ctx.computeHash(blob);
        if (
            knownHashes.has(hash.toString()) &&
            (await ctx.getHash(endpoint, hash))
        ) {
            task.status = 'duplicate';
            ctx.processedTasks.unshift(task);
            await storeThumbnail(ctx.db, base.id);
            for (const evicted of trimProcessed(ctx.processedTasks)) {
                await deleteStoredBlob(ctx.db, evicted.id);
            }
            return 'duplicate';
        }
    }
    ctx.queuedTasks.put(task);
    return true;
};
