import { mdiAlertCircleOutline, mdiCheckBold } from '@mdi/js';
import mdiVue from 'mdi-vue/v3';
import { createApp, h } from 'vue';
import type { UploadTask } from '@/entrypoints/background/uploader';
import Notifications from '@/entrypoints/notifications.content/Notifications.vue';
import TaskList from '@/entrypoints/popup/uploads-tab/TaskList.vue';
import './harness.css';

// The components talk to WebExtension APIs that do not exist on a plain
// page. Stub the subset they touch so the harness exercises the real
// components.
(window as any).browser = {
    storage: {
        sync: {
            get: async () => ({}),
            set: async () => {},
            remove: async () => {},
        },
    },
    runtime: {
        sendMessage: async () => undefined,
        onMessage: { addListener: () => {} },
    },
};

const portMessages: unknown[] = [];
const fakePort = {
    postMessage: (message: unknown) => {
        portMessages.push(message);
    },
};
(window as any).__portMessages = portMessages;

const tasks: UploadTask[] = [
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
    {
        id: 't-complete',
        endpoint: 'https://example.test',
        retries: 0,
        status: 'complete',
        type: 'photoUrl',
        url: 'https://example.test/complete.jpg',
    },
];

// Same wiring as UploadsTab: task events are forwarded to the background
// port.
createApp({
    render: () =>
        h(TaskList, {
            tasks,
            port: fakePort,
            onRemoveTask: (id: string) => {
                fakePort.postMessage({ type: 'removeTask', id });
            },
        }),
})
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
