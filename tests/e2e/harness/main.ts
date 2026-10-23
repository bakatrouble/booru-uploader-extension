import { mdiAlertCircleOutline, mdiCheckBold } from '@mdi/js';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import mdiVue from 'mdi-vue/v3';
import { createApp, h } from 'vue';
import type { UploadTask } from '@/entrypoints/background/uploader';
import Notifications from '@/entrypoints/notifications.content/Notifications.vue';
import UploadsTab from '@/entrypoints/popup/uploads-tab/UploadsTab.vue';
import './harness.css';

// The components talk to WebExtension APIs that do not exist on a plain
// page. Stub the subset they touch so the harness exercises the real
// components.
const sentMessages: unknown[][] = [];
(window as any).__sentMessages = sentMessages;
(window as any).browser = {
    storage: {
        sync: {
            get: async () => ({}),
            set: async () => {},
            remove: async () => {},
        },
    },
    runtime: {
        sendMessage: async (...args: unknown[]) => {
            sentMessages.push(args);
            return undefined;
        },
        onMessage: { addListener: () => {} },
    },
};

const portMessages: unknown[] = [];
const fakePort = {
    postMessage: (message: unknown) => {
        portMessages.push(message);
    },
} as unknown as Browser.runtime.Port;
(window as any).__portMessages = portMessages;

const queued: UploadTask[] = [
    {
        id: 't-queued',
        endpoint: 'https://example.test',
        retries: 0,
        status: 'queued',
        type: 'photoUrl',
        url: 'https://example.test/queued.jpg',
    },
    {
        id: 't-processing',
        endpoint: 'https://example.test',
        retries: 0,
        status: 'processing',
        type: 'photoUrl',
        url: 'https://example.test/processing.jpg',
    },
];

const processed: UploadTask[] = [
    {
        id: 't-complete',
        endpoint: 'https://example.test',
        retries: 0,
        status: 'complete',
        type: 'photoUrl',
        url: 'https://example.test/complete.jpg',
    },
    {
        id: 't-failed',
        endpoint: 'https://example.test',
        retries: 2,
        status: 'failed',
        type: 'photoUrl',
        url: 'https://example.test/failed.jpg',
    },
];

// Same wiring as the popup: task events are forwarded to the background
// port by UploadsTab itself.
createApp({
    render: () => h(UploadsTab, { queued, processed, port: fakePort }),
})
    .use(VueQueryPlugin, { queryClient: new QueryClient() })
    .component('mdicon', {
        render: () => h('i', { class: 'mdicon-stub' }),
    })
    .mount('#tasks');

const notifications = createApp(Notifications)
    .use(mdiVue, {
        icons: { mdiCheckBold, mdiAlertCircleOutline },
    })
    .mount('#notifs');

(window as any).__notify = (options: unknown) =>
    (notifications as any).pushNotification(options);
(window as any).__updateNotify = (options: unknown) =>
    (notifications as any).updateNotification(options);
