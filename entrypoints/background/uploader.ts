import { type IDBPDatabase, openDB } from 'idb';
import ky from 'ky';
import { uuidv7 } from 'uuidv7';
import { ContextMenuManager } from '@/utils/context-menu';
import { NotificationLevel } from '@/utils/enums';
import { isDev } from '@/utils/env';
import HasherWorker from '@/utils/hasherWorker?worker';
import { Mutex } from '@/utils/mutex';
import { Queue } from '@/utils/queue';
import {
    attemptUpload,
    MAX_UPLOAD_RETRIES,
    UPLOAD_TIMEOUT_MS,
    type UploadEndpoint,
} from './attempt';
import { computeHashWithWorker } from './hasher';
import {
    enqueuePhotoFile,
    normalizePhotoInput,
    type PhotoIntakeContext,
} from './photoIntake';
import {
    buildTaskListMessage,
    removeTaskFromLists,
    retryFailedTask,
    trimProcessed,
} from './taskUtils';
import { deleteStoredBlob, storeThumbnail } from './thumbnails';
import type {
    ExternalMessage,
    PortMessage,
    UploadResponse,
    UploadTask,
} from './types';

export type {
    ExternalMessage,
    PortMessage,
    UploadResponse,
    UploadTask,
} from './types';

export class Uploader {
    queuedTasks = new Queue<UploadTask>();
    processedTasks: UploadTask[] = [];
    ports = new Set<Browser.runtime.Port>();
    processingDisplaying = false;
    db?: IDBPDatabase;
    imageHashes: Record<string, Set<string>> = {};
    contextMenuManager: ContextMenuManager;
    hasherWorker: Worker;
    uploadLock = new Mutex();

    constructor() {
        browser.browserAction.setBadgeBackgroundColor({ color: 'teal' });

        browser.runtime.onMessageExternal.addListener((message, sender) =>
            this.handleExternalMessage(message, sender),
        );
        browser.runtime.onMessage.addListener((message) =>
            this.handleExternalMessage(message, {}),
        );
        browser.runtime.onConnect.addListener((port) => {
            if (port.name === 'uploader') {
                return this.handlePortConnection(port);
            }
            return false;
        });

        openDB('booru-uploader', 2, {
            upgrade(db) {
                db.createObjectStore('images');
            },
        }).then(async (db) => {
            this.db = db;
            await db.clear('images');
        });

        this.hasherWorker = new HasherWorker();
        this.hasherWorker.postMessage('init');

        if (isDev) {
            // browser.tabs.create({
            //     url: browser.runtime.getURL('options.html'),
            // });
            // browser.tabs.create({
            //     url: browser.runtime.getURL('popup.html'),
            // });
            // browser.tabs.create({
            //     url: browser.runtime.getURL('notifications-test-page.html'),
            // });
        }

        this.contextMenuManager = new ContextMenuManager(this);

        // noinspection JSIgnoredPromiseFromCall
        this.worker();
    }

    async getHashes(endpoint: string) {
        if (this.imageHashes[endpoint]) return;
        this.imageHashes[endpoint] = new Set();
        const response: { hashes: string[] } = await this.getKyClient(endpoint)
            .get('hashes')
            .json();
        this.imageHashes[endpoint] = new Set(response.hashes);
    }

    async getHash(endpoint: string, hash: string) {
        const response: { exists: boolean } = await this.getKyClient(endpoint)
            .get(`hashes/${hash}`)
            .json();
        if (response.exists) {
            this.imageHashes[endpoint]?.add(hash);
        } else {
            this.imageHashes[endpoint]?.delete(hash);
        }
        return response.exists;
    }

    async handleMessage(message: ExternalMessage, tabId?: number) {
        if (message.type !== 'upload') return;

        const releaseLock = await this.uploadLock.acquire();
        try {
            let notificationId: string | undefined;

            if (tabId) {
                notificationId = await browser.tabs.sendMessage(tabId, {
                    type: 'notification',
                    options: {
                        level: NotificationLevel.Loading,
                        message: `Uploading ${message.method === 'gif' ? 'GIF' : 'picture'}...`,
                    },
                });
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
                status: 'queued' as const,
            };
            let result: true | 'duplicate' = true;
            const intake: PhotoIntakeContext = {
                db: this.db,
                imageHashes: this.imageHashes,
                queuedTasks: this.queuedTasks,
                processedTasks: this.processedTasks,
                computeHash: (blob) => this.computeHash(blob),
                getHash: (endpoint, hash) => this.getHash(endpoint, hash),
            };
            switch (message.method) {
                case 'photoBase64':
                case 'photoArrayBuffer': {
                    const blob = await normalizePhotoInput(message);
                    result = await enqueuePhotoFile(
                        intake,
                        base,
                        blob,
                        message.endpoint,
                    );
                    break;
                }
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
                            message: `Duplicate`,
                        },
                    });
                } else {
                    await browser.tabs.sendMessage(tabId, {
                        type: 'update-notification',
                        options: {
                            id: notificationId,
                            level: NotificationLevel.Success,
                            message: `${message.method === 'gif' ? 'GIF' : 'Picture'} sent`,
                        },
                    });
                }
            }
            this.sendUpdateToPorts();
            return {};
        } finally {
            releaseLock();
        }
    }

    handleExternalMessage(
        message: ExternalMessage,
        sender: Browser.runtime.MessageSender,
    ) {
        if (message.type === 'upload') {
            return this.handleMessage(message, sender?.tab?.id);
        } else if (message.type === 'getUploadLinks') {
            return new Promise((resolve) =>
                resolve(this.contextMenuManager.uploadLinks),
            );
        } else if (message.type === 'updateContextMenu') {
            return this.contextMenuManager.init();
        }
    }

    handlePortConnection(port: Browser.runtime.Port) {
        this.ports.add(port);

        port.postMessage(
            buildTaskListMessage(this.queuedTasks.items, this.processedTasks),
        );

        port.onMessage.addListener(async (response) => {
            const msg = response as PortMessage;

            switch (msg.type) {
                case 'removeTask': {
                    const removed = removeTaskFromLists(
                        this.queuedTasks.items,
                        this.processedTasks,
                        msg.id,
                    );
                    if (removed) {
                        await deleteStoredBlob(this.db, removed.id);
                    }
                    this.sendUpdateToPorts();
                    break;
                }
                case 'retryTask': {
                    retryFailedTask(
                        this.processedTasks,
                        (task) => this.queuedTasks.put(task),
                        msg.id,
                    );
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
            prefix: `${endpoint}`,
        });
    }

    async computeHash(image: Blob): Promise<string> {
        const result = await computeHashWithWorker(this.hasherWorker, image);
        console.log('hash computed', result);
        return result;
    }

    private makeUploadEndpoint(endpoint: string): UploadEndpoint {
        const client = this.getKyClient(endpoint);
        const post = (
            path: string,
            options: { body?: FormData; json?: unknown },
        ): Promise<UploadResponse> =>
            client
                .post(path, {
                    ...options,
                    throwHttpErrors: false,
                    timeout: UPLOAD_TIMEOUT_MS,
                })
                .json<UploadResponse>();
        return {
            postPhoto: (body) => post('photo', { body }),
            postPhotoUrl: (url) => post('photo', { json: { url } }),
            postGif: (url) => post('gif', { json: { url } }),
        };
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
                const { outcome, hash, retries } = await attemptUpload(
                    task,
                    this.makeUploadEndpoint(task.endpoint),
                    async () => (await this.db?.get('images', task.id)) ?? null,
                    { maxRetries: MAX_UPLOAD_RETRIES },
                );
                task.retries = retries;
                if (outcome === 'duplicate') {
                    if (hash) this.imageHashes[task.endpoint]?.add(hash);
                    task.status = 'duplicate';
                } else if (outcome === 'complete') {
                    if (hash) this.imageHashes[task.endpoint]?.add(hash);
                    task.status = 'complete';
                } else {
                    task.status = 'failed';
                }
                if (
                    (task.status === 'complete' ||
                        task.status === 'duplicate') &&
                    task.type === 'photoFile'
                ) {
                    await storeThumbnail(this.db, task.id);
                }
            } catch (e) {
                console.error('Error processing task:', e);
                task.status = 'failed';
            } finally {
                this.queuedTasks.shift();
                this.processedTasks.unshift(task);
                for (const evicted of trimProcessed(this.processedTasks)) {
                    await deleteStoredBlob(this.db, evicted.id);
                }
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
        const message = buildTaskListMessage(
            this.queuedTasks.items,
            this.processedTasks,
        );
        this.ports.forEach((port) => {
            port.postMessage(message);
        });
    }
}
