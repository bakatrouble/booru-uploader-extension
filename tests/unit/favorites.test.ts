import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import Favorites from '@/entrypoints/e621-favorites.content/Favorites.vue';
import { storageData, stubBrowser } from './setup';

const makeSubPort = () => ({
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
});

const mountFavorites = () =>
    mount(Favorites, {
        global: {
            stubs: { OwO: true, SubscriptionsBlock: true },
        },
    });

describe('Favorites subscriptions port', () => {
    it('connects on mount and reconnects after a disconnect', async () => {
        vi.useFakeTimers();
        try {
            storageData.apiKey = 'secret';
            document.body.innerHTML =
                '<div class="tag-list-item" data-name="cat"></div>';

            const ports: ReturnType<typeof makeSubPort>[] = [];
            stubBrowser.runtime.connect.mockImplementation(() => {
                const port = makeSubPort();
                ports.push(port);
                return port;
            });

            const wrapper = mountFavorites();
            await vi.waitFor(() => expect(ports).toHaveLength(1));

            // First subscription push marks loading done.
            const onMessage = ports[0]!.onMessage.addListener.mock
                .calls[0]![0] as (message: unknown) => void;
            onMessage({ subscriptions: { e621: ['cat'] } });

            // Background restart drops the port; a new one is opened.
            const onDisconnect = ports[0]!.onDisconnect.addListener.mock
                .calls[0]![0] as () => void;
            onDisconnect();
            expect(ports).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(2000);
            expect(ports).toHaveLength(2);

            wrapper.unmount();
            expect(ports[1]!.disconnect).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
