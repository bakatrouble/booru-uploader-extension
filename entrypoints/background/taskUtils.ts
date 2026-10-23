import type { UploadTask } from './uploader';

export const buildTaskListMessage = (
    queued: UploadTask[],
    processed: UploadTask[],
) => ({
    type: 'taskList' as const,
    queued,
    processed,
});

/**
 * Removes a task by id. Queued tasks that are already `processing` are
 * kept (they cannot be cancelled); processed entries are always removed.
 * Returns which list the task was removed from.
 */
export const removeTaskFromLists = (
    queued: UploadTask[],
    processed: UploadTask[],
    id: string,
): 'queued' | 'processed' | null => {
    let removed: 'queued' | 'processed' | null = null;
    const queuedIdx = queued.findIndex((task) => task.id === id);
    const queuedTask = queuedIdx === -1 ? undefined : queued[queuedIdx];
    if (queuedTask && queuedTask.status !== 'processing') {
        queued.splice(queuedIdx, 1);
        removed = 'queued';
    }
    const processedIdx = processed.findIndex((task) => task.id === id);
    if (processedIdx !== -1) {
        processed.splice(processedIdx, 1);
        removed = 'processed';
    }
    return removed;
};
