import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('ky', () => ({
    default: {
        extend: vi.fn(),
    },
}));

import ky from 'ky';
import SubscriptionItem from '@/entrypoints/popup/e621-tab/SubscriptionItem.vue';

const mockedExtend = vi.mocked(ky.extend);

describe('SubscriptionItem', () => {
    it('deletes via the website-scoped subscriptions endpoint', async () => {
        const json = vi.fn(async () => ({}));
        const clientDelete = vi.fn(() => ({ json }));
        mockedExtend.mockReturnValue({ delete: clientDelete } as never);

        const queryClient = new QueryClient();
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

        const wrapper = mount(SubscriptionItem, {
            props: { query: 'cat', website: 'e621' },
            global: {
                plugins: [[VueQueryPlugin, { queryClient }]],
            },
        });

        expect(wrapper.find('.query').attributes('href')).toBe(
            'https://e621.net/posts?tags=cat',
        );

        await wrapper.find('button').trigger('click');
        await vi.waitFor(() => expect(clientDelete).toHaveBeenCalled());
        expect(clientDelete).toHaveBeenCalledWith(
            'subscriptions?website=e621',
            { json: { subs: ['cat'] } },
        );
        await vi.waitFor(() =>
            expect(invalidate).toHaveBeenCalledWith({
                queryKey: ['subs', 'e621'],
            }),
        );
        wrapper.unmount();

        const gelbooru = mount(SubscriptionItem, {
            props: { query: 'cat dog', website: 'gelbooru' },
            global: {
                plugins: [[VueQueryPlugin, { queryClient }]],
            },
        });
        expect(gelbooru.find('.query').attributes('href')).toBe(
            'https://gelbooru.com/index.php?page=post&s=list&tags=cat%20dog',
        );
        gelbooru.unmount();
    });
});
