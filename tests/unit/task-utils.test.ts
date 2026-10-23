import { describe, expect, it, vi } from 'vitest';
import {
    buildTaskListMessage,
    removeTaskFromLists,
    retryFailedTask,
    trimProcessed,
} from '@/entrypoints/background/taskUtils';
import type { UploadTask } from '@/entrypoints/background/uploader';

const makeTask = (id: string, status: UploadTask['status']): UploadTask => ({
    id,
    endpoint: 'https://example.test',
    retries: 0,
    status,
    type: 'photoUrl',
    url: 'https://example.test/i.jpg',
});

describe('buildTaskListMessage', () => {
    it('wraps both lists in a taskList message', () => {
        const queued = [makeTask('q1', 'queued')];
        const processed = [makeTask('p1', 'complete')];
        expect(buildTaskListMessage(queued, processed)).toEqual({
            type: 'taskList',
            queued,
            processed,
        });
    });
});

describe('removeTaskFromLists', () => {
    it('removes a queued task that is not processing', () => {
        const queued = [makeTask('q1', 'queued')];
        const processed = [makeTask('p1', 'complete')];
        expect(removeTaskFromLists(queued, processed, 'q1')?.id).toBe('q1');
        expect(queued).toEqual([]);
        expect(processed).toHaveLength(1);
    });

    it('keeps a queued task that is processing', () => {
        const queued = [makeTask('q1', 'processing')];
        const processed: UploadTask[] = [];
        expect(removeTaskFromLists(queued, processed, 'q1')).toBeNull();
        expect(queued).toHaveLength(1);
    });

    it('removes processed tasks of any status, including failed', () => {
        for (const status of ['complete', 'duplicate', 'failed'] as const) {
            const queued = [makeTask('q1', 'queued')];
            const processed = [makeTask('p1', status)];
            const removed = removeTaskFromLists(queued, processed, 'p1');
            expect(removed?.id).toBe('p1');
            expect(processed).toEqual([]);
            expect(queued).toHaveLength(1);
        }
    });

    it('leaves both lists untouched for an unknown id', () => {
        const queued = [makeTask('q1', 'queued')];
        const processed = [makeTask('p1', 'complete')];
        expect(removeTaskFromLists(queued, processed, 'nope')).toBeNull();
        expect(queued).toHaveLength(1);
        expect(processed).toHaveLength(1);
    });
});

describe('trimProcessed', () => {
    it('evicts the oldest terminal entries beyond the cap', () => {
        const processed = [
            makeTask('new', 'complete'),
            makeTask('mid', 'duplicate'),
            makeTask('old', 'complete'),
        ];
        const evicted = trimProcessed(processed, 2);
        expect(evicted.map((t) => t.id)).toEqual(['old']);
        expect(processed.map((t) => t.id)).toEqual(['new', 'mid']);
    });

    it('never evicts failed tasks automatically', () => {
        const processed = [makeTask('a', 'failed'), makeTask('b', 'failed')];
        expect(trimProcessed(processed, 0)).toEqual([]);
        expect(processed).toHaveLength(2);
    });

    it('keeps the list untouched within the cap', () => {
        const processed = [makeTask('a', 'complete')];
        expect(trimProcessed(processed, 100)).toEqual([]);
        expect(processed).toHaveLength(1);
    });
});

describe('retryFailedTask', () => {
    it('moves a failed task back to the queue with reset retries', () => {
        const processed = [makeTask('p1', 'failed')];
        const enqueued: UploadTask[] = [];
        expect(retryFailedTask(processed, (t) => enqueued.push(t), 'p1')).toBe(
            true,
        );
        expect(processed).toEqual([]);
        expect(enqueued).toHaveLength(1);
        expect(enqueued[0]!.status).toBe('queued');
        expect(enqueued[0]!.retries).toBe(0);
    });

    it('ignores non-failed and unknown tasks', () => {
        const processed = [makeTask('p1', 'complete')];
        const enqueue = vi.fn();
        expect(retryFailedTask(processed, enqueue, 'p1')).toBe(false);
        expect(retryFailedTask(processed, enqueue, 'nope')).toBe(false);
        expect(enqueue).not.toHaveBeenCalled();
        expect(processed).toHaveLength(1);
    });
});
