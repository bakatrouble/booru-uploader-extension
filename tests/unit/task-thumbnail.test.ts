import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { UploadTask } from '@/entrypoints/background/uploader';
import TaskThumbnail from '@/entrypoints/popup/uploads-tab/TaskThumbnail.vue';
import { readTaskThumbnail } from '@/utils/imageStore';

vi.mock('@/utils/imageStore', () => ({
    readTaskThumbnail: vi.fn(),
}));

const mockedReadThumbnail = vi.mocked(readTaskThumbnail);

const stubUrls = () => {
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as never;
    URL.revokeObjectURL = revokeObjectURL as never;
    return { createObjectURL, revokeObjectURL, realCreate, realRevoke };
};

const makeFileTask = (): UploadTask =>
    ({
        id: 'a',
        apiKey: 'test-key',
        retries: 0,
        status: 'complete',
        type: 'photoFile',
    }) as UploadTask;

describe('TaskThumbnail', () => {
    it('loads the stored thumbnail and revokes it on unmount', async () => {
        const { createObjectURL, revokeObjectURL, realCreate, realRevoke } =
            stubUrls();
        try {
            mockedReadThumbnail.mockResolvedValue(
                new Blob(['thumb'], { type: 'image/jpeg' }),
            );
            const wrapper = mount(TaskThumbnail, {
                props: { task: makeFileTask() },
            });
            await vi.waitFor(() =>
                expect(wrapper.find('img').attributes('src')).toBe('blob:fake'),
            );
            expect(createObjectURL).toHaveBeenCalledTimes(1);
            wrapper.unmount();
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
        } finally {
            URL.createObjectURL = realCreate as never;
            URL.revokeObjectURL = realRevoke as never;
        }
    });

    it('renders remote urls directly without touching storage', async () => {
        mockedReadThumbnail.mockClear();
        const wrapper = mount(TaskThumbnail, {
            props: {
                task: {
                    ...makeFileTask(),
                    type: 'photoUrl',
                    url: 'https://example.test/i.jpg',
                } as UploadTask,
            },
        });
        expect(wrapper.find('img').attributes('src')).toBe(
            'https://example.test/i.jpg',
        );
        expect(mockedReadThumbnail).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('renders nothing when nothing is stored', async () => {
        mockedReadThumbnail.mockResolvedValue(null);
        const wrapper = mount(TaskThumbnail, {
            props: { task: makeFileTask() },
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(wrapper.find('img').exists()).toBe(false);
        wrapper.unmount();
    });
});
