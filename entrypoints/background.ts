import { uuidv7 } from 'uuidv7';
import { Queue } from '@/entrypoints/queue';

type Port = Browser.runtime.Port;

type WsMessage = {
    type: 'task_list',
    queued: Task[],
    processed: Task[],
} | {
    type: 'task_update',
    task: Task,
};

type PortMessage = {
    type: 'removeTask',
    id: string,
}

type ExternalMessage = {
    type: 'photoBase64';
    data: string;
} | {
    type: 'photoUrl';
    url: string;
} | {
    type: 'gif';
    url: string;
};

type UploadTask = {
    id: string;
    endpoint: string;
    retries: number;
    status: 'queued' | 'processing' | 'completed' | 'duplicate' | 'failed';
} & (
    {
        type: 'photoFile';
        base64: string;
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

    constructor() {
        browser.browserAction.setBadgeBackgroundColor({ color: 'teal' });

        browser.runtime.onMessageExternal
            .addListener(message => this.handleExternalMessage(message));
        browser.runtime.onConnect.addListener(port => this.handlePortConnection(port))

        // noinspection JSIgnoredPromiseFromCall
        this.worker();
    }

    handleExternalMessage(message: ExternalMessage) {
        const base = {
            id: uuidv7(),
            endpoint: 'https://example.com/upload',
            retries: 0,
            status: 'queued',
        };
        switch (message.type) {
            case 'photoBase64':
                this.queuedTasks.put({
                    type: 'photoFile',
                    ...base,
                    base64: message.data,
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

    async worker() {
        const createFetchParams = (method: string, params: any[]) => ({
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
        });

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
                        const r = await fetch(
                            task.endpoint,
                            createFetchParams('post_photo', [task.base64, true])
                        );
                        response = await r.json();
                        break;
                    }
                    case 'photoUrl': {
                        const r = await fetch(
                            task.endpoint,
                            createFetchParams('post_photo', [task.url, false])
                        );
                        response = await r.json();
                        break;
                    }
                    case 'gif': {
                        const r = await fetch(
                            task.endpoint,
                            createFetchParams('post_gif', [task.url])
                        );
                        response = await r.json();
                        break;
                    }
                }
                if (response.status === true) {
                    task.status = 'completed';
                } else if (response.status === 'duplicate') {
                    task.status = 'duplicate';
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
        browser.browserAction.setBadgeBackgroundColor({ color: 'teal' })

        let queuedTasks: Task[] = [];
        let processedTasks: Task[] = [];
        const ports: Browser.runtime.Port[] = [];

        let ws: WebSocket;
        let lastCount = 0;

        const connect = () => {
            ws = new WebSocket('ws://localhost:5000/ws');
            ws.onopen = () => {
                console.log('WebSocket connection established');
                ws.send(JSON.stringify({ type: 'get_tasks' }));
            };
            ws.onclose = (e) => {
                console.log('WebSocket connection closed:', e);
                setTimeout(() => connect(), 500);
            }
            ws.onmessage = (event) => {
                const data: WsMessage = JSON.parse(event.data);
                console.log('Received data:', data);
                switch (data.type) {
                    case 'task_list':
                        queuedTasks = data.queued;
                        processedTasks = data.processed;
                        break;
                    case 'task_update':
                        switch (data.task.status) {
                            case 'queued':
                            case 'processing': {
                                const idx = queuedTasks.findIndex(task => task.id === data.task.id);
                                if (idx !== -1) {
                                    queuedTasks[idx] = data.task;
                                } else {
                                    queuedTasks.push(data.task);
                                }
                                break;
                            }
                            case 'completed':
                            case 'duplicate':
                            case 'failed': {
                                const idx = queuedTasks.findIndex(task => task.id === data.task.id);
                                if (idx !== -1) {
                                    queuedTasks.splice(idx, 1);
                                }
                                const processedIdx = processedTasks.findIndex(task => task.id === data.task.id);
                                if (processedIdx !== -1) {
                                    processedTasks[processedIdx] = data.task;
                                } else {
                                    processedTasks.unshift(data.task);
                                }
                                break;
                            }
                            case 'removed': {
                                const queuedIdx = queuedTasks.findIndex(task => task.id === data.task.id);
                                if (queuedIdx !== -1) {
                                    queuedTasks.splice(queuedIdx, 1);
                                }
                                const processedIdx = processedTasks.findIndex(task => task.id === data.task.id);
                                if (processedIdx !== -1) {
                                    processedTasks.splice(processedIdx, 1);
                                }
                                break;
                            }
                        }
                        break;
                }

                const queueEmpty = queuedTasks.length === 0;
                const queueWasEmpty = lastCount === 0;
                browser.browserAction.setBadgeText({
                    text: queueEmpty ? '' : `${queuedTasks.length}`,
                });
                if (queueEmpty && !queueWasEmpty || !queueEmpty && queueWasEmpty) {
                    browser.browserAction.setIcon({
                        path: browser.runtime.getURL(queueEmpty ? '/default-icon.svg' : '/loader-icon.svg'),
                    });
                }
                lastCount = queuedTasks.length;

                ports.forEach(port => {
                    port.postMessage({
                        type: 'task_list',
                        queued: queuedTasks,
                        processed: processedTasks,
                    });
                })
            }
        }
        connect();

        if (import.meta.env.DEV) {
            const popupUrl = browser.runtime.getURL('/popup.html');
            browser.tabs.create({
                url: popupUrl,
            });
        }

        browser.runtime.onConnect.addListener(port => {
            ports.push(port);

            port.postMessage({
                type: 'task_list',
                queued: queuedTasks,
                processed: processedTasks,
            });

            port.onMessage.addListener((msg: PortMessage) => {
                switch (msg.type) {
                    case 'removeTask':
                        ws.send(JSON.stringify({
                            type: 'remove_task',
                            id: msg.id,
                        }));
                        break;
                }
            });

            port.onDisconnect.addListener(port => {
                const idx = ports.indexOf(port);
                if (idx !== -1) {
                    ports.splice(idx, 1);
                }
            });
        })
    }
});
