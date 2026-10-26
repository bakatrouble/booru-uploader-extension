import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { UploadTask } from '@/entrypoints/background/uploader';
import UploadsTab from '@/entrypoints/popup/uploads-tab/UploadsTab.vue';
import { stubBrowser } from './setup';

const makeTask = (id: string, status: UploadTask['status']): UploadTask =>
    ({
        id,
        apiKey: 'test-key',
        retries: 0,
        status,
        type: 'photoUrl',
        url: 'https://example.test/i.jpg',
    }) as UploadTask;

const mountTab = (queued: UploadTask[] = [], processed: UploadTask[] = []) =>
    mount(UploadsTab, {
        props: {
            queued,
            processed,
            port: { postMessage: vi.fn() } as never,
        },
        global: {
            plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]],
            stubs: { mdicon: true },
        },
    });

describe('UploadsTab', () => {
    it('dev build exposes a test-upload button sending the file bytes', async () => {
        const bytes = new Uint8Array([137, 80, 78, 71]);
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(bytes.buffer as ArrayBuffer)),
        );
        try {
            const wrapper = mountTab();
            const button = wrapper
                .findAll('button')
                .find((candidate) => candidate.text() === 'test');
            expect(button?.exists()).toBe(true);

            await button!.trigger('click');
            await vi.waitFor(() =>
                expect(stubBrowser.runtime.sendMessage).toHaveBeenCalled(),
            );
            const [message] = stubBrowser.runtime.sendMessage.mock
                .calls[0] as unknown as [
                {
                    type: string;
                    method: string;
                    data: unknown;
                    mimeType: string;
                },
            ];
            expect(message.type).toBe('upload');
            expect(message.method).toBe('photoArrayBuffer');
            expect(message.mimeType).toBe('image/jpeg');
            expect(message.data).toBeInstanceOf(ArrayBuffer);
            expect(new Uint8Array(message.data as ArrayBuffer)).toEqual(bytes);
            wrapper.unmount();
        } finally {
            vi.unstubAllGlobals();
            vi.stubGlobal('browser', stubBrowser);
        }
    });

    it('forwards remove and retry events to the port', async () => {
        const postMessage = vi.fn();
        const wrapper = mount(UploadsTab, {
            props: {
                queued: [],
                processed: [makeTask('f1', 'failed')],
                port: { postMessage } as never,
            },
            global: {
                plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]],
                stubs: { mdicon: true },
            },
        });

        await wrapper.find('.remove-btn').trigger('click');
        expect(postMessage).toHaveBeenCalledWith({
            type: 'removeTask',
            id: 'f1',
        });
        await wrapper.find('.retry-btn').trigger('click');
        expect(postMessage).toHaveBeenCalledWith({
            type: 'retryTask',
            id: 'f1',
        });
        wrapper.unmount();
    });

    it('filters the processed list down to failed tasks', async () => {
        const wrapper = mountTab(
            [],
            [makeTask('ok', 'complete'), makeTask('bad', 'failed')],
        );
        expect(wrapper.findAll('.task-cell')).toHaveLength(2);

        const toggle = wrapper
            .findAll('button')
            .find((button) => button.text() === 'Failed only')!;
        await toggle.trigger('click');
        expect(wrapper.findAll('.task-cell')).toHaveLength(1);
        expect(wrapper.text()).toContain('failed');
        wrapper.unmount();
    });
});
