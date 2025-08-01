import { uuidv7 } from 'uuidv7';
import { IDBPDatabase, openDB } from 'idb';
import { Queue } from '@/utils/queue';
import { base64ToBlob, blobToBase64 } from 'file64';
import { loadPyodide, PyodideInterface } from 'pyodide';
import { isDev } from '@/utils/env';

type Port = Browser.runtime.Port;

type PortMessage = {
    type: 'removeTask',
    id: string,
}

type ExternalMessage = {
    endpoint: string;
} & (
    {
        type: 'photoBase64';
        data: string;
    } | {
        type: 'photoUrl';
        url: string;
    } | {
        type: 'gif';
        url: string;
    }
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

class Uploader {
    queuedTasks = new Queue<UploadTask>();
    processedTasks: UploadTask[] = [];
    ports = new Set<Port>();
    processingDisplaying = false;
    db?: IDBPDatabase;
    imageHashes: Record<string, Set<string>> = {};
    pyodide?: PyodideInterface;
    computeHashPackage: any;

    constructor() {
        browser.browserAction.setBadgeBackgroundColor({ color: 'teal' });

        browser.runtime.onMessageExternal
            .addListener((message, _, sendResponse) => this.handleExternalMessage(message, sendResponse));
        browser.runtime.onMessage
            .addListener((message, _, sendResponse) => this.handleExternalMessage(message, sendResponse));
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

        // noinspection TypeScriptValidateTypes
        const assetsDir = browser.runtime.getURL('/pyodide');
        loadPyodide({
            indexURL: assetsDir,
            packageCacheDir: `${assetsDir}/static`,
        }).then(async pyodide => {
            this.pyodide = pyodide;
            await pyodide.loadPackage(['Pillow', 'numpy', 'scipy', 'openblas']);
            const scripts = await fetch(`${browser.runtime.getURL('/pyodide/pyscripts.zip')}`);
            pyodide.unpackArchive(await scripts.arrayBuffer(), 'zip');
            this.computeHashPackage = pyodide.pyimport('compute_hash');
        });

        if (isDev) {
            browser.tabs.create({
                url: browser.runtime.getURL('popup.html'),
            });
        }

        // noinspection JSIgnoredPromiseFromCall
        this.worker();
    }

    async getHashes(endpoint: string) {
        if (this.imageHashes[endpoint])
            return;
        this.imageHashes[endpoint] = new Set();
        const response = await this.jsonRpcRequest(
            endpoint,
            'get_hashes',
        );
        this.imageHashes[endpoint] = new Set((await response.json()).result);
    }

    handleExternalMessage(message: ExternalMessage, sendResponse: (response: any) => void) {
        (async () => {
            await this.getHashes(message.endpoint);

            const base = {
                id: uuidv7(),
                endpoint: message.endpoint,
                retries: 0,
                status: 'queued',
            };
            let result: true | 'duplicate' = true;
            switch (message.type) {
                case 'photoBase64':
                    const blob = await base64ToBlob(`data:image/jpeg;base64,${message.data}`);
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
            this.sendUpdateToPorts();
            sendResponse({
                result,
            });
        })();
        return true;
    }

    handlePortConnection(port: Port) {
        this.ports.add(port);

        port.postMessage({
            type: 'taskList',
            queued: this.queuedTasks.items,
            processed: this.processedTasks,
        });

        port.onMessage.addListener((msg: PortMessage) => {
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
                    break;
                }
            }
        });

        port.onDisconnect.addListener(() => {
            this.ports.delete(port);
        });
    }

    jsonRpcRequest(endpoint: string, method: string, ...params: any[]) {
        return fetch(
            endpoint,
            {
                headers: {
                    'content-type': 'application/json',
                },
                method: 'POST',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 0,
                    method,
                    params,
                }),
            }
        )
    }

    async computeHash(image: Blob): Promise<string> {
        const buffer = await image.arrayBuffer();
        const result = await this.computeHashPackage.compute_hash(buffer);
        console.log(result);
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
                browser.browserAction.setIcon({
                    path: browser.runtime.getURL('/loader-icon.svg'),
                });
            }
            browser.browserAction.setBadgeText({
                text: `${this.queuedTasks.items.length}`,
            });

            try {
                let response;
                switch (task.type) {
                    case 'photoFile': {
                        const blob = await this.db?.get('images', task.id);
                        const base64 = (await blobToBase64(blob)).split(',')[1];
                        const r = await this.jsonRpcRequest(
                            task.endpoint,
                            'post_photo',
                            base64,
                            true,
                        );
                        response = await r.json();
                        break;
                    }
                    case 'photoUrl': {
                        const r = await this.jsonRpcRequest(
                            task.endpoint,
                            'post_photo',
                            task.url,
                            false,
                        );
                        response = await r.json();
                        break;
                    }
                    case 'gif': {
                        const r = await this.jsonRpcRequest(
                            task.endpoint,
                            'post_gif',
                            task.url,
                        );
                        response = await r.json();
                        break;
                    }
                }
                if (response.result.status === 'duplicate') {
                    this.imageHashes[task.endpoint]?.add(response.result.hash);
                    task.status = 'duplicate';
                } else if (response.result.status === 'ok') {
                    this.imageHashes[task.endpoint]?.add(response.result.hash);
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
                    browser.browserAction.setIcon({
                        path: browser.runtime.getURL('/default-icon.svg'),
                    });
                    browser.browserAction.setBadgeText({ text: '' });
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
