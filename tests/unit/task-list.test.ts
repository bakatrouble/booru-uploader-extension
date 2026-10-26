import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { UploadTask } from '@/entrypoints/background/uploader';
import TaskList from '@/entrypoints/popup/uploads-tab/TaskList.vue';
import { readTaskThumbnail } from '@/utils/imageStore';

vi.mock('@/utils/imageStore', () => ({
    readTaskThumbnail: vi.fn(),
}));

const mockedReadThumbnail = vi.mocked(readTaskThumbnail);

const makeTask = (
    id: string,
    type: UploadTask['type'],
    status: UploadTask['status'],
): UploadTask =>
    ({
        id,
        apiKey: 'test-key',
        retries: 0,
        status,
        type,
        ...(type === 'photoFile' ? {} : { url: 'https://example.test/i.jpg' }),
    }) as UploadTask;

const mountList = (tasks: UploadTask[]) =>
    mount(TaskList, {
        props: { tasks },
        global: {
            stubs: { mdicon: true },
        },
    });

describe('TaskList', () => {
    it('keeps the right thumbnail when tasks before it are removed', async () => {
        mockedReadThumbnail.mockImplementation(
            async (id: string) => new Blob([`img-${id}`]),
        );
        const created: Array<{ blob: Blob; url: string }> = [];
        let counter = 0;
        const realCreateObjectURL = URL.createObjectURL;
        URL.createObjectURL = vi.fn((blob: Blob) => {
            const url = `blob:thumb-${counter++}`;
            created.push({ blob, url });
            return url;
        }) as never;
        const textOf = async (url: string) =>
            created.find((entry) => entry.url === url)!.blob.text();
        try {
            const wrapper = mountList([
                makeTask('a', 'photoFile', 'complete'),
                makeTask('b', 'photoFile', 'complete'),
            ]);
            await vi.waitFor(() => {
                expect(wrapper.findAll('.task-cell img')).toHaveLength(2);
            });
            const firstSrc = wrapper
                .findAll('.task-cell')
                .at(0)!
                .find('img')
                .attributes('src')!;
            expect(await textOf(firstSrc)).toBe('img-a');

            await wrapper.setProps({
                tasks: [makeTask('b', 'photoFile', 'complete')],
            });
            await vi.waitFor(() => {
                expect(wrapper.findAll('.task-cell')).toHaveLength(1);
            });
            const remainingSrc = wrapper
                .find('.task-cell')
                .find('img')
                .attributes('src');
            // Without :key the surviving cell reuses the first instance
            // and keeps showing task A's thumbnail.
            expect(await textOf(remainingSrc!)).toBe('img-b');
            wrapper.unmount();
        } finally {
            URL.createObjectURL = realCreateObjectURL as never;
        }
    });

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

    it('renders stored thumbnails for file tasks and remote urls directly', async () => {
        mockedReadThumbnail.mockResolvedValue(
            new Blob(['thumb'], { type: 'image/jpeg' }),
        );
        const createObjectURL = vi
            .fn(() => 'blob:fake')
            .mockName('createObjectURL');
        const realCreateObjectURL = URL.createObjectURL;
        URL.createObjectURL = createObjectURL as never;
        try {
            const wrapper = mountList([
                makeTask('a', 'photoFile', 'queued'),
                makeTask('b', 'photoUrl', 'queued'),
            ]);
            await vi.waitFor(() => {
                expect(wrapper.findAll('.task-cell img')).toHaveLength(2);
            });
            const images = wrapper.findAll('.task-cell img');
            expect(images[0]!.attributes('src')).toBe('blob:fake');
            expect(images[1]!.attributes('src')).toBe(
                'https://example.test/i.jpg',
            );
            expect(mockedReadThumbnail).toHaveBeenCalledWith('a');
            wrapper.unmount();
        } finally {
            URL.createObjectURL = realCreateObjectURL as never;
        }
    });

    it('shows no image when nothing is stored for a file task', async () => {
        mockedReadThumbnail.mockResolvedValue(null);
        const wrapper = mountList([makeTask('a', 'photoFile', 'queued')]);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(wrapper.findAll('.task-cell img')).toHaveLength(0);
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

    it('offers remove for idle tasks and retry only for failed ones', async () => {
        const processing = mountList([makeTask('a', 'photoUrl', 'processing')]);
        expect(processing.find('.remove-btn').exists()).toBe(false);
        expect(processing.find('.retry-btn').exists()).toBe(false);
        processing.unmount();

        const queued = mountList([makeTask('a', 'photoUrl', 'queued')]);
        expect(queued.find('.remove-btn').exists()).toBe(true);
        expect(queued.find('.retry-btn').exists()).toBe(false);
        await queued.find('.remove-btn').trigger('click');
        expect(queued.emitted('removeTask')).toEqual([['a']]);
        queued.unmount();

        for (const status of ['complete', 'duplicate'] as const) {
            const done = mountList([makeTask('a', 'photoUrl', status)]);
            expect(done.find('.remove-btn').exists()).toBe(true);
            expect(done.find('.retry-btn').exists()).toBe(false);
            done.unmount();
        }

        const failed = mountList([makeTask('a', 'photoUrl', 'failed')]);
        expect(failed.find('.remove-btn').exists()).toBe(true);
        await failed.find('.retry-btn').trigger('click');
        expect(failed.emitted('retryTask')).toEqual([['a']]);
        failed.unmount();
    });

    it('shows an empty placeholder without tasks', () => {
        const wrapper = mountList([]);
        expect(wrapper.text()).toContain('No data');
        wrapper.unmount();
    });
});
