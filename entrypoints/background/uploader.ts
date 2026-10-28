import { type IDBPDatabase, openDB } from 'idb';
import ky from 'ky';
import { uuidv7 } from 'uuidv7';
import { getApiRoot, normalizeApiRoot } from '@/utils/apiRoot';
import { ContextMenuManager } from '@/utils/context-menu';
import { NotificationLevel } from '@/utils/enums';
import { isDev } from '@/utils/env';
import HasherWorker from '@/utils/hasherWorker?worker';
import { Queue } from '@/utils/queue';
import { Semaphore } from '@/utils/semaphore';
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
import { deleteFullBlob, deleteStoredBlobs } from './thumbnails';
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

/**
 * Interprets a raw upload HTTP response against the channel-helper API:
 * 200 carries `UploadResponse`; 400 either repeats the `UploadResponse`
 * shape with `status: "duplicate"` (hash dedupe, empty `upload_id`) or an
 * `ErrorBody`. Anything else is transient and retried via throw.
 */
export const parseUploadResponse = async (
    response: Response,
): Promise<UploadResponse> => {
    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    const record =
        typeof body === 'object' && body !== null
            ? (body as Record<string, unknown>)
            : {};
    if (response.status === 200) {
        if (record.status === 'ok') {
            return {
                status: 'ok',
                hash:
                    typeof record.hash === 'string'
                        ? (record.hash as string)
                        : undefined,
                upload_id:
                    typeof record.upload_id === 'string'
                        ? (record.upload_id as string)
                        : '',
            };
        }
        if (record.status === 'duplicate') {
            return {
                status: 'duplicate',
                hash:
                    typeof record.hash === 'string'
                        ? (record.hash as string)
                        : '',
            };
        }
        return {
            status: 'error',
            message: 'Unexpected upload response',
        };
    }
    if (response.status === 400) {
        if (record.status === 'duplicate') {
            return {
                status: 'duplicate',
                hash:
                    typeof record.hash === 'string'
                        ? (record.hash as string)
                        : '',
            };
        }
        return {
            status: 'error',
            message:
                typeof record.message === 'string'
                    ? (record.message as string)
                    : `Upload rejected (HTTP 400)`,
        };
    }
    throw new Error(`Upload failed: HTTP ${response.status}`);
};

export class Uploader {
    queuedTasks = new Queue<UploadTask>();
    processedTasks: UploadTask[] = [];
    ports = new Set<Browser.runtime.Port>();
    processingDisplaying = false;
    db?: IDBPDatabase;
    dbReady: Promise<IDBPDatabase>;
    imageHashes: Record<string, Set<string>> = {};
    contextMenuManager: ContextMenuManager;
    hasherWorker: Worker;
    /**
     * Caps concurrent intake handling so a slow hash or idb write does
     * not stall every other upload. Notifications go out before
     * acquiring, so feedback stays immediate under load.
     */
    uploadGate = new Semaphore(3);

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

        // Opened once and shared: awaiting it (instead of a bare
        // `this.db` read) closes the race where an upload lands before
        // the async open completes and its blobs silently vanish.
        this.dbReady = openDB('booru-uploader', 2, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('images')) {
                    db.createObjectStore('images');
                }
            },
        }).then(async (db) => {
            await db.clear('images');
            return db;
        });
        this.dbReady.then(
            (db) => {
                this.db = db;
            },
            (e) => console.error('Failed to open image database:', e),
        );

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

    async getHashes(apiKey: string) {
        if (this.imageHashes[apiKey]) return;
        this.imageHashes[apiKey] = new Set();
        const client = await this.getAuthedClient(apiKey);
        const response: { hashes?: string[] } = await client
            .get('hashes')
            .json();
        this.imageHashes[apiKey] = new Set(
            Array.isArray(response.hashes) ? response.hashes : [],
        );
    }

    /**
     * Messages can arrive before the async idb open completes (e.g. an
     * upload right after browser startup). Without this gate the intake
     * silently skips storing the blob and its thumbnail — the task then
     * shows up with no thumbnail (or fails outright in the worker).
     */
    async ensureDb(): Promise<void> {
        if (!this.db) {
            try {
                this.db = await this.dbReady;
            } catch (e) {
                console.error('Failed to open image database:', e);
            }
        }
    }

    async getHash(apiKey: string, hash: string) {
        const client = await this.getAuthedClient(apiKey);
        const response: { exists?: boolean } = await client
            .get(`hashes/${hash}`)
            .json();
        const exists = response.exists === true;
        if (exists) {
            this.imageHashes[apiKey]?.add(hash);
        } else {
            this.imageHashes[apiKey]?.delete(hash);
        }
        return exists;
    }

    async handleMessage(
        message: ExternalMessage,
        tabId?: number,
        frameId?: number,
    ) {
        if (message.type !== 'upload') return;

        // Pre-migration messages carried `endpoint` (a per-destination base
        // URL); the new shape carries `apiKey` against the global API root.
        const apiKey =
            (message as { apiKey?: unknown }).apiKey ??
            (message as { endpoint?: unknown }).endpoint;
        if (typeof apiKey !== 'string' || !apiKey) {
            console.error('Upload rejected: destination has no API key');
            return {};
        }

        // Scope delivery to the sender's frame when known: tabs.sendMessage
        // otherwise broadcasts to every frame, and the first response wins
        // — sibling frames' listeners (or the image-getter content script,
        // which declines with `false`) must not be able to claim it.
        const sendOpts = frameId !== undefined ? { frameId } : undefined;

        // Generate the id up-front instead of capturing it from the
        // sendMessage response: the response channel is unreliable here —
        // measured: the content script receives the message and returns a
        // valid id, yet the sender's promise still resolves `undefined`
        // (even single-listener). Frame scoping above narrows delivery;
        // the sender-side id makes the completion update deterministic.
        const notificationId: string | undefined = tabId ? uuidv7() : undefined;
        if (tabId && notificationId) {
            try {
                await browser.tabs.sendMessage(
                    tabId,
                    {
                        type: 'notification',
                        options: {
                            id: notificationId,
                            level: NotificationLevel.Loading,
                            message: `Uploading ${message.method === 'gif' ? 'GIF' : 'picture'}...`,
                        },
                    },
                    ...(sendOpts ? [sendOpts] : []),
                );
            } catch (e) {
                // The tab is gone or has no content script; upload anyway
                // without progress feedback.
                console.error('Error sending notification:', e);
            }
        }

        const releaseGate = await this.uploadGate.acquire();
        try {
            await this.ensureDb();
            try {
                await this.getHashes(apiKey);
            } catch (e) {
                console.error('Error fetching hashes:', e);
            }

            const base = {
                id: uuidv7(),
                apiKey,
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
                getHash: (key, hash) => this.getHash(key, hash),
            };
            switch (message.method) {
                case 'photoBase64':
                case 'photoArrayBuffer': {
                    const blob = await normalizePhotoInput(message);
                    result = await enqueuePhotoFile(intake, base, blob, apiKey);
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
                    await browser.tabs.sendMessage(
                        tabId,
                        {
                            type: 'update-notification',
                            options: {
                                id: notificationId,
                                level: NotificationLevel.Error,
                                message: `Duplicate`,
                            },
                        },
                        ...(sendOpts ? [sendOpts] : []),
                    );
                } else {
                    await browser.tabs.sendMessage(
                        tabId,
                        {
                            type: 'update-notification',
                            options: {
                                id: notificationId,
                                level: NotificationLevel.Success,
                                message: `${message.method === 'gif' ? 'GIF' : 'Picture'} sent`,
                            },
                        },
                        ...(sendOpts ? [sendOpts] : []),
                    );
                }
            }
            this.sendUpdateToPorts();
            return {};
        } finally {
            releaseGate();
        }
    }

    handleExternalMessage(
        message: ExternalMessage,
        sender: Browser.runtime.MessageSender,
    ) {
        if (message.type === 'upload') {
            return this.handleMessage(
                message,
                sender?.tab?.id,
                sender?.frameId,
            );
        } else if (message.type === 'getUploadLinks') {
            return new Promise((resolve) =>
                resolve(this.contextMenuManager.uploadLinks),
            );
        } else if (message.type === 'updateContextMenu') {
            return this.contextMenuManager.init();
        } else if (
            message.type === 'notification' ||
            message.type === 'update-notification' ||
            message.type === 'remove-notification'
        ) {
            // Relay to the notifications content script living in the
            // sender's frame: cross-extension messages never reach its
            // onMessage listener directly. Scoped to sender.frameId when
            // known so sibling frames' listeners can't claim the response.
            if (sender?.tab?.id === undefined) return;
            return browser.tabs.sendMessage(
                sender.tab.id,
                message,
                ...(sender.frameId !== undefined
                    ? [{ frameId: sender.frameId }]
                    : []),
            );
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
                        await deleteStoredBlobs(this.db, removed.id);
                        await this.deleteRemoteTask(removed);
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

    getKyClient(apiRoot: string, apiKey: string) {
        return ky.extend({
            prefix: normalizeApiRoot(apiRoot),
            headers: { 'x-key': apiKey },
        });
    }

    /** Same client against the currently configured global API root. */
    async getAuthedClient(apiKey: string) {
        return this.getKyClient(await getApiRoot(), apiKey);
    }

    async computeHash(image: Blob): Promise<string> {
        const result = await computeHashWithWorker(this.hasherWorker, image);
        console.log('hash computed', result);
        return result;
    }

    private makeUploadEndpoint(apiKey: string): UploadEndpoint {
        const post = async (
            path: string,
            options: { body?: Blob; json?: unknown },
        ): Promise<UploadResponse> => {
            const client = await this.getAuthedClient(apiKey);
            const headers =
                options.body != null
                    ? {
                          'content-type':
                              (options.body as Blob).type ||
                              'application/octet-stream',
                      }
                    : undefined;
            const response = await client.post(path, {
                ...options,
                ...(headers ? { headers } : {}),
                throwHttpErrors: false,
                timeout: UPLOAD_TIMEOUT_MS,
            });
            return parseUploadResponse(response);
        };
        return {
            postFile: (blob) => post('upload', { body: blob }),
            postUrl: (url) => post('upload-url', { json: { url } }),
        };
    }

    /**
     * Drops the server-side task (and any post made from it). Best
     * effort: local removal already happened, so failures only log.
     */
    async deleteRemoteTask(task: UploadTask): Promise<void> {
        if (!task.uploadId || !task.apiKey) return;
        try {
            await (await this.getAuthedClient(task.apiKey))
                .delete('delete', { json: { upload_id: task.uploadId } })
                .json();
        } catch (e) {
            console.error('Error deleting remote task:', e);
        }
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
                const { outcome, hash, uploadId, retries } =
                    await attemptUpload(
                        task,
                        this.makeUploadEndpoint(task.apiKey),
                        async () =>
                            (await this.db?.get('images', task.id)) ?? null,
                        { maxRetries: MAX_UPLOAD_RETRIES },
                    );
                task.retries = retries;
                if (outcome === 'duplicate') {
                    if (hash) this.imageHashes[task.apiKey]?.add(hash);
                    task.status = 'duplicate';
                } else if (outcome === 'complete') {
                    if (hash) this.imageHashes[task.apiKey]?.add(hash);
                    if (uploadId) task.uploadId = uploadId;
                    task.status = 'complete';
                } else {
                    task.status = 'failed';
                }
                if (
                    (task.status === 'complete' ||
                        task.status === 'duplicate') &&
                    task.type === 'photoFile'
                ) {
                    await deleteFullBlob(this.db, task.id);
                }
            } catch (e) {
                console.error('Error processing task:', e);
                task.status = 'failed';
            } finally {
                this.queuedTasks.shift();
                this.processedTasks.unshift(task);
                for (const evicted of trimProcessed(this.processedTasks)) {
                    await deleteStoredBlobs(this.db, evicted.id);
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
