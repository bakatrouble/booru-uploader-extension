import type { UploadTask } from './types';

export const buildTaskListMessage = (
    queued: UploadTask[],
    processed: UploadTask[],
) => ({
    type: 'taskList' as const,
    queued,
    processed,
});

/**
 * Removes a task by id for manual deletion. Queued tasks that are
 * already `processing` are kept (they cannot be cancelled); every
 * processed entry — complete, duplicate or failed — can be removed.
 * Returns the removed task so callers can clean up its stored blobs.
 */
export const removeTaskFromLists = (
    queued: UploadTask[],
    processed: UploadTask[],
    id: string,
): UploadTask | null => {
    const queuedIdx = queued.findIndex((task) => task.id === id);
    const queuedTask = queuedIdx === -1 ? undefined : queued[queuedIdx];
    if (queuedTask && queuedTask.status !== 'processing') {
        return queued.splice(queuedIdx, 1)[0] ?? null;
    }
    const processedIdx = processed.findIndex((task) => task.id === id);
    if (processedIdx !== -1) {
        return processed.splice(processedIdx, 1)[0] ?? null;
    }
    return null;
};

export const MAX_PROCESSED_TASKS = 100;

/**
 * Evicts the oldest terminal (complete/duplicate) entries beyond `cap`.
 * Failed tasks are never trimmed automatically — they stay until the
 * user retries or deletes them. Returns evicted tasks for blob cleanup.
 */
export const trimProcessed = (
    processed: UploadTask[],
    cap: number = MAX_PROCESSED_TASKS,
): UploadTask[] => {
    const evicted: UploadTask[] = [];
    while (processed.length > cap) {
        const idx = processed.findLastIndex(
            (task) => task.status === 'complete' || task.status === 'duplicate',
        );
        if (idx === -1) break;
        evicted.push(...processed.splice(idx, 1));
    }
    return evicted;
};

/**
 * Moves a failed task back to the queue for another attempt. Returns
 * whether anything was requeued.
 */
export const retryFailedTask = (
    processed: UploadTask[],
    enqueue: (task: UploadTask) => void,
    id: string,
): boolean => {
    const idx = processed.findIndex(
        (task) => task.id === id && task.status === 'failed',
    );
    if (idx === -1) return false;
    const [task] = processed.splice(idx, 1);
    if (!task) return false;
    task.status = 'queued';
    task.retries = 0;
    enqueue(task);
    return true;
};
