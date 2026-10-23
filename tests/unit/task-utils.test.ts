import { describe, expect, it } from 'vitest';
import {
    buildTaskListMessage,
    removeTaskFromLists,
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
        expect(removeTaskFromLists(queued, processed, 'q1')).toBe('queued');
        expect(queued).toEqual([]);
        expect(processed).toHaveLength(1);
    });

    it('keeps a queued task that is processing', () => {
        const queued = [makeTask('q1', 'processing')];
        const processed: UploadTask[] = [];
        expect(removeTaskFromLists(queued, processed, 'q1')).toBeNull();
        expect(queued).toHaveLength(1);
    });

    it('removes a processed task', () => {
        const queued = [makeTask('q1', 'queued')];
        const processed = [makeTask('p1', 'failed')];
        expect(removeTaskFromLists(queued, processed, 'p1')).toBe('processed');
        expect(processed).toEqual([]);
        expect(queued).toHaveLength(1);
    });

    it('leaves both lists untouched for an unknown id', () => {
        const queued = [makeTask('q1', 'queued')];
        const processed = [makeTask('p1', 'complete')];
        expect(removeTaskFromLists(queued, processed, 'nope')).toBeNull();
        expect(queued).toHaveLength(1);
        expect(processed).toHaveLength(1);
    });
});
