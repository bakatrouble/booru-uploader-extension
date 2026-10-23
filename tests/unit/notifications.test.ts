import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Notifications from '@/entrypoints/notifications.content/Notifications.vue';
import { NotificationLevel } from '@/utils/enums';
import { stubBrowser } from './setup';

const mountNotifications = () =>
    mount(Notifications, {
        global: {
            stubs: { mdicon: true },
        },
    });

describe('Notifications', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('pushes a notification and removes it after the timeout', async () => {
        const wrapper = mountNotifications();
        const id = (await (wrapper.vm as any).pushNotification({
            level: NotificationLevel.Success,
            message: 'hello',
        })) as string;
        expect(typeof id).toBe('string');
        expect(wrapper.text()).toContain('hello');

        await vi.advanceTimersByTimeAsync(4999);
        expect(wrapper.text()).toContain('hello');
        await vi.advanceTimersByTimeAsync(1);
        expect(wrapper.text()).not.toContain('hello');
        wrapper.unmount();
    });

    it('keeps loading notifications until they resolve', async () => {
        const wrapper = mountNotifications();
        const id = await (wrapper.vm as any).pushNotification({
            level: NotificationLevel.Loading,
            message: 'working',
        });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(wrapper.text()).toContain('working');

        await (wrapper.vm as any).updateNotification({
            id,
            level: NotificationLevel.Success,
            message: 'done',
        });
        expect(wrapper.text()).toContain('done');
        await vi.advanceTimersByTimeAsync(5000);
        expect(wrapper.text()).not.toContain('done');
        wrapper.unmount();
    });

    it('routes runtime messages to push and update', async () => {
        const wrapper = mountNotifications();
        const listener =
            stubBrowser.runtime.onMessage.addListener.mock.calls[0]![0];

        const id = (await listener({
            type: 'notification',
            options: { level: NotificationLevel.Error, message: 'boom' },
        })) as string;
        expect(wrapper.text()).toContain('boom');

        await listener({
            type: 'update-notification',
            options: { id, level: NotificationLevel.Success, message: 'ok' },
        });
        expect(wrapper.text()).toContain('ok');
        wrapper.unmount();
    });
});
