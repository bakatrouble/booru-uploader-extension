import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { UploadTask } from '@/entrypoints/background/uploader';
import TaskList from '@/entrypoints/popup/uploads-tab/TaskList.vue';

const makeTask = (
    id: string,
    type: UploadTask['type'],
    status: UploadTask['status'],
): UploadTask =>
    ({
        id,
        endpoint: 'https://example.test',
        retries: 0,
        status,
        type,
        ...(type === 'photoFile'
            ? { file: 'blob:fake' }
            : { url: 'https://example.test/i.jpg' }),
    }) as UploadTask;

const mountList = (tasks: UploadTask[]) =>
    mount(TaskList, {
        props: { tasks },
        global: {
            stubs: { mdicon: true },
        },
    });

describe('TaskList', () => {
    it('renders one cell per task with its status', () => {
        const wrapper = mountList([
            makeTask('a', 'photoUrl', 'queued'),
            makeTask('b', 'photoUrl', 'complete'),
        ]);
        expect(wrapper.findAll('.task-cell')).toHaveLength(2);
        expect(wrapper.text()).toContain('queued');
        expect(wrapper.text()).toContain('complete');
        wrapper.unmount();
    });

    it('shows a thumbnail only for file tasks', () => {
        const wrapper = mountList([
            makeTask('a', 'photoFile', 'queued'),
            makeTask('b', 'photoUrl', 'queued'),
        ]);
        const images = wrapper.findAll('.task-cell img');
        expect(images).toHaveLength(1);
        expect(images[0]!.attributes('src')).toBe('blob:fake');
        wrapper.unmount();
    });

    it('spins for queued and processing, not for terminal states', () => {
        for (const status of ['queued', 'processing'] as const) {
            const wrapper = mountList([makeTask('a', 'photoUrl', status)]);
            expect(wrapper.find('.task-spinner').exists()).toBe(true);
            wrapper.unmount();
        }
        for (const status of ['complete', 'duplicate', 'failed'] as const) {
            const wrapper = mountList([makeTask('a', 'photoUrl', status)]);
            expect(wrapper.find('.task-spinner').exists()).toBe(false);
            wrapper.unmount();
        }
    });

    it('hides the remove button while processing and emits removeTask', async () => {
        const processing = mountList([makeTask('a', 'photoUrl', 'processing')]);
        expect(processing.find('.remove-btn').exists()).toBe(false);
        processing.unmount();

        const queued = mountList([makeTask('a', 'photoUrl', 'queued')]);
        await queued.find('.remove-btn').trigger('click');
        expect(queued.emitted('removeTask')).toEqual([['a']]);
        queued.unmount();
    });

    it('shows an empty placeholder without tasks', () => {
        const wrapper = mountList([]);
        expect(wrapper.text()).toContain('No data');
        wrapper.unmount();
    });
});
