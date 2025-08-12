import { uuidv7 } from 'uuidv7';
import { IDBPDatabase, openDB } from 'idb';
import { Queue } from '@/utils/queue';
import { base64ToBlob } from 'file64';
import { isDev } from '@/utils/env';
import { NotificationLevel } from '@/utils/enums';
import { ContextMenuManager } from '@/utils/context-menu';
import HasherWorker from '../utils/hasherWorker?worker';
import ky from 'ky';

type PortMessage = {
    type: 'removeTask',
    id: string,
}

type ExternalMessage = {
    type: 'updateContextMenu' | 'getUploadLinks',
} | (
    {
        type: 'upload',
        endpoint: string;
    } & (
        {
            method: 'photoBase64';
            data: string;
        } | {
            method: 'photoUrl';
            url: string;
        } | {
            method: 'gif';
            url: string;
        }
    )
);

export type UploadTask = {
    id: string;
    endpoint: string;
    retries: number;
    status: 'queued' | 'processing' | 'completed' | 'duplicate' | 'failed';
} & (
    {
        type: 'photoFile';
        file?: string;
    } |
    {
        type: 'photoUrl';
        url: string;
    } |
    {
        type: 'gif';
        url: string;
    }
);

export class Uploader {
    queuedTasks = new Queue<UploadTask>();
    processedTasks: UploadTask[] = [];
    ports = new Set<browser.runtime.Port>();
    processingDisplaying = false;
    db?: IDBPDatabase;
    imageHashes: Record<string, Set<string>> = {};
    contextMenuManager: ContextMenuManager;
    hasherWorker: Worker;

    constructor() {
        browser.browserAction.setBadgeBackgroundColor({ color: 'teal' });

        browser.runtime.onMessageExternal
            .addListener((message, sender) => this.handleExternalMessage(message, sender));
        browser.runtime.onMessage
            .addListener((message) => this.handleExternalMessage(message, {}));
        browser.runtime.onConnect
            .addListener(port => this.handlePortConnection(port))

        openDB('booru-uploader', 2, {
            upgrade(db) {
                db.createObjectStore('images');
            }
        }).then(async db => {
            this.db = db
            await db.clear('images');
        });

        this.hasherWorker = new HasherWorker();
        this.hasherWorker.postMessage('init')

        if (isDev) {
            browser.tabs.create({
                url: browser.runtime.getURL('popup.html'),
            });
        }

        this.contextMenuManager = new ContextMenuManager(this);

        // noinspection JSIgnoredPromiseFromCall
        this.worker();
    }

    async getHashes(endpoint: string) {
        if (this.imageHashes[endpoint])
            return;
        this.imageHashes[endpoint] = new Set();
        const response: { hashes: string[] } = await this.getKyClient(endpoint).get('hashes').json();
        this.imageHashes[endpoint] = new Set(response.hashes);
    }

    async handleMessage(message: ExternalMessage, tabId?: number) {
        if (message.type !== 'upload')
            return;

        let notificationId: string | undefined;

        if (tabId) {
            notificationId = await browser.tabs.sendMessage(tabId, {
                type: 'notification',
                options: {
                    level: NotificationLevel.Loading,
                    title: 'Uploading',
                    message: `Uploading ${message.method === 'gif' ? 'GIF' : 'picture'}...`,
                },
            });
            console.log('sent notification');
        }

        try {
            await this.getHashes(message.endpoint);
        } catch (e) {
            console.error('Error fetching hashes:', e);
        }

        const base = {
            id: uuidv7(),
            endpoint: message.endpoint,
            retries: 0,
            status: 'queued',
        };
        let result: true | 'duplicate' = true;
        switch (message.method) {
            case 'photoBase64':
                const blob = await base64ToBlob(`data:${message.data}`);
                const task = {
                    type: 'photoFile',
                    ...base,
                    file: URL.createObjectURL(blob),
                } as UploadTask;
                await this.db?.put('images', blob, base.id);
                if (this.imageHashes[message.endpoint]) {
                    const hash = await this.computeHash(blob);
                    if (this.imageHashes[message.endpoint].has(hash.toString())) {
                        task.status = result = 'duplicate';
                        this.processedTasks.unshift(task);
                        break;
                    }
                }
                this.queuedTasks.put({
                    type: 'photoFile',
                    ...base,
                    file: URL.createObjectURL(blob),
                } as UploadTask);
                break;
            case 'photoUrl':
                this.queuedTasks.put({
                    type: 'photoUrl',
                    ...base,
                    url: message.url,
                } as UploadTask);
                break;
            case 'gif':
                this.queuedTasks.put({
                    type: 'gif',
                    ...base,
                    url: message.url,
                } as UploadTask);
                break;
        }
        if (tabId && notificationId) {
            if (result === 'duplicate') {
                await browser.tabs.sendMessage(tabId, {
                    type: 'update-notification',
                    options: {
                        id: notificationId,
                        level: NotificationLevel.Error,
                        title: 'Duplicate',
                        message: `This image was sent before`,
                    }
                });
            } else {
                await browser.tabs.sendMessage(tabId, {
                    type: 'update-notification',
                    options: {
                        id: notificationId,
                        level: NotificationLevel.Success,
                        title: 'Success',
                        message: `${message.method === 'gif' ? 'GIF' : 'Picture'} was sent successfully`,
                    }
                });
            }
        }
        this.sendUpdateToPorts();
        return {};
    }

    handleExternalMessage(message: ExternalMessage, sender: browser.runtime.MessageSender) {
        if (message.type === 'upload') {
            return this.handleMessage(message, sender?.tab?.id);
        } else if (message.type === 'getUploadLinks') {
            return new Promise(resolve => resolve(this.contextMenuManager.uploadLinks));
        } else if (message.type === 'updateContextMenu') {
            return this.contextMenuManager.init();
        }
    }

    handlePortConnection(port: browser.runtime.Port) {
        this.ports.add(port);

        port.postMessage({
            type: 'taskList',
            queued: this.queuedTasks.items,
            processed: this.processedTasks,
        });

        port.onMessage.addListener(response => {
            const msg = response as PortMessage;

            switch (msg.type) {
                case 'removeTask': {
                    const queuedIdx = this.queuedTasks.items.findIndex(task => task.id === msg.id);
                    if (queuedIdx !== -1 && this.queuedTasks.items[queuedIdx].status !== 'processing') {
                        this.queuedTasks.items.splice(queuedIdx, 1);
                    }
                    const processedIdx = this.processedTasks.findIndex(task => task.id === msg.id);
                    if (processedIdx !== -1) {
                        this.processedTasks.splice(processedIdx, 1);
                    }
                    this.sendUpdateToPorts();
                    break;
                }
            }
        });

        port.onDisconnect.addListener(() => {
            this.ports.delete(port);
        });
    }

    getKyClient(endpoint: string) {
        return ky.extend({
            prefixUrl: `${endpoint}`,
        });
    }

    async computeHash(image: Blob): Promise<string> {
        const buffer = new Uint8Array(await image.arrayBuffer());
        const result = await new Promise<string>(resolve => {
            const id = uuidv7();
            const listener = (e: MessageEvent<{ id: string, hash: string }>) => {
                const { id, hash } = e.data;
                if (id !== id) return;
                resolve(hash);
                this.hasherWorker.removeEventListener('message', listener);
            };
            this.hasherWorker.addEventListener('message', listener)
            this.hasherWorker.postMessage({ id, buffer });
        });
        console.log('hash computed', result);
        return result;
    }

    async worker() {
        // noinspection InfiniteLoopJS
        while (true) {
            const task = await this.queuedTasks.wait();
            task.status = 'processing';
            this.sendUpdateToPorts();

            if (!this.processingDisplaying) {
                this.processingDisplaying = true;
                await browser.browserAction.setIcon({
                    path: browser.runtime.getURL('/loader-icon.svg'),
                });
            }
            await browser.browserAction.setBadgeText({
                text: `${this.queuedTasks.items.length}`,
            });

            try {
                let response: {
                    status: 'ok',
                    hash?: string,
                    upload_id: string,
                } | {
                    status: 'duplicate',
                    hash: string,
                } | {
                    status: 'error',
                    message: string,
                }
                const ky = this.getKyClient(task.endpoint);
                switch (task.type) {
                    case 'photoFile': {
                        const blob = await this.db?.get('images', task.id);
                        const body = new FormData();
                        body.append('upload', blob, `image-${task.id}.jpg`);
                        response = await ky.post('photo', { body }).json();
                        break;
                    }
                    case 'photoUrl': {
                        response = await ky.post('photo', {
                            json: {
                                url: task.url
                            },
                        }).json();
                        break;
                    }
                    case 'gif': {
                        response = await ky.post('gif', {
                            json: {
                                url: task.url
                            },
                        }).json();
                        break;
                    }
                }
                if (response.status === 'duplicate') {
                    this.imageHashes[task.endpoint]?.add(response.hash);
                    task.status = 'duplicate';
                } else if (response.status === 'ok') {
                    if (response.hash) {
                        this.imageHashes[task.endpoint]?.add(response.hash);
                    }
                    task.status = 'completed';
                } else {
                    task.status = 'failed';
                }
            } catch (e) {
                console.error('Error processing task:', e);
                task.status = 'failed';
            } finally {
                this.queuedTasks.shift();
                this.processedTasks.unshift(task);
                if (this.queuedTasks.items.length === 0) {
                    this.processingDisplaying = false;
                    await browser.browserAction.setIcon({
                        path: browser.runtime.getURL('/default-icon.svg'),
                    });
                    await browser.browserAction.setBadgeText({ text: '' });
                }
                this.sendUpdateToPorts();
            }
        }
    }

    sendUpdateToPorts() {
        const message = {
            type: 'taskList',
            queued: this.queuedTasks.items,
            processed: this.processedTasks,
        };
        this.ports.forEach(port => port.postMessage(message));
    }
}

// noinspection JSUnusedGlobalSymbols
export default defineBackground({
    main: () => {
        new Uploader();
    }
});
