import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ky', () => ({
    default: {
        extend: vi.fn(),
        create: vi.fn(),
    },
}));

// Relative path (not `@/...`): mock ids with the `?worker` query must
// bypass alias resolution to match the import in uploader.ts.
vi.mock('../../utils/hasherWorker?worker', () => ({
    default: class {
        postMessage = vi.fn();
        addEventListener = vi.fn();
        removeEventListener = vi.fn();
    },
}));

vi.mock('idb', () => ({
    openDB: vi.fn(async () => ({
        clear: vi.fn(async () => {}),
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
    })),
}));

import ky from 'ky';
import type { UploadTask } from '@/entrypoints/background/uploader';
import {
    parseUploadResponse,
    Uploader,
} from '@/entrypoints/background/uploader';
import { Queue } from '@/utils/queue';

const mockedExtend = vi.mocked(ky.extend);

const makeTask = (id: string, status: UploadTask['status']): UploadTask => ({
    id,
    apiKey: 'test-key',
    retries: 0,
    status,
    type: 'photoUrl',
    url: 'https://example.test/i.jpg',
});

describe('Uploader.getKyClient', () => {
    it('scopes the client to the api root with the x-key header', () => {
        const uploader = Object.create(Uploader.prototype) as Uploader;
        uploader.getKyClient('http://127.0.0.1:8080/', 'test-key');
        expect(mockedExtend).toHaveBeenCalledWith({
            prefix: 'http://127.0.0.1:8080',
            headers: { 'x-key': 'test-key' },
        });
    });
});

describe('Uploader hash cache', () => {
    let uploader: Uploader;

    beforeEach(() => {
        uploader = Object.create(Uploader.prototype) as Uploader;
        uploader.imageHashes = {};
    });

    it('getHashes populates the set once and caches it', async () => {
        const get = vi.fn(() => ({
            json: async () => ({ hashes: ['aaa', 'bbb'] }),
        }));
        mockedExtend.mockReturnValue({ get } as never);

        await uploader.getHashes('test-key');
        await uploader.getHashes('test-key');

        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith('hashes');
        expect(uploader.imageHashes['test-key']).toEqual(
            new Set(['aaa', 'bbb']),
        );
    });

    it('getHash records hits and evicts misses', async () => {
        uploader.imageHashes['test-key'] = new Set(['aaa']);
        const get = vi.fn((url: string) => ({
            json: async () => ({ exists: url === 'hashes/aaa' }),
        }));
        mockedExtend.mockReturnValue({ get } as never);

        await expect(uploader.getHash('test-key', 'aaa')).resolves.toBe(true);
        await expect(uploader.getHash('test-key', 'zzz')).resolves.toBe(false);
        expect(uploader.imageHashes['test-key']).toEqual(new Set(['aaa']));
    });
});

describe('Uploader.handleExternalMessage', () => {
    let uploader: Uploader;

    beforeEach(() => {
        uploader = Object.create(Uploader.prototype) as Uploader;
        uploader.contextMenuManager = {
            uploadLinks: [{ id: '1', name: 'n' }],
            init: vi.fn(),
        } as never;
    });

    it('routes getUploadLinks to the context menu links', async () => {
        await expect(
            uploader.handleExternalMessage({ type: 'getUploadLinks' }, {}),
        ).resolves.toEqual([{ id: '1', name: 'n' }]);
    });

    it('routes updateContextMenu to context menu init', async () => {
        await uploader.handleExternalMessage({ type: 'updateContextMenu' }, {});
        expect(uploader.contextMenuManager.init).toHaveBeenCalled();
    });

    it('routes uploads to handleMessage with the sender tab id', async () => {
        const spy = vi
            .spyOn(Uploader.prototype, 'handleMessage')
            .mockResolvedValue({});
        const message = {
            type: 'upload',
            apiKey: 'test-key',
            method: 'photoUrl',
            url: 'https://example.test/i.jpg',
        } as never;
        await uploader.handleExternalMessage(message, {
            tab: { id: 7 },
        } as never);
        expect(spy).toHaveBeenCalledWith(message, 7);
        spy.mockRestore();
    });
});

describe('Uploader.handlePortConnection', () => {
    it('publishes the task list, removes tasks, tracks ports', async () => {
        const uploader = Object.create(Uploader.prototype) as Uploader;
        uploader.queuedTasks = { items: [makeTask('q1', 'queued')] } as never;
        uploader.processedTasks = [makeTask('p1', 'complete')];
        uploader.ports = new Set();
        const dbDelete = vi.fn(async () => {});
        uploader.db = { delete: dbDelete } as never;

        const messageListeners: Array<(msg: unknown) => void> = [];
        const disconnectListeners: Array<() => void> = [];
        const port = {
            postMessage: vi.fn(),
            onMessage: {
                addListener: vi.fn((l: (msg: unknown) => void) => {
                    messageListeners.push(l);
                }),
            },
            onDisconnect: {
                addListener: vi.fn((l: () => void) => {
                    disconnectListeners.push(l);
                }),
            },
        };

        uploader.handlePortConnection(port as never);

        expect(uploader.ports.has(port as never)).toBe(true);
        expect(port.postMessage).toHaveBeenCalledWith({
            type: 'taskList',
            queued: uploader.queuedTasks.items,
            processed: uploader.processedTasks,
        });

        messageListeners[0]!({ type: 'removeTask', id: 'q1' });
        expect(uploader.queuedTasks.items).toEqual([]);
        await vi.waitFor(() =>
            expect(port.postMessage).toHaveBeenCalledTimes(2),
        );

        messageListeners[0]!({ type: 'removeTask', id: 'p1' });
        expect(uploader.processedTasks).toEqual([]);
        expect(dbDelete).toHaveBeenCalledWith('images', 'p1');
        await vi.waitFor(() =>
            expect(dbDelete).toHaveBeenCalledWith('images', 'p1:thumb'),
        );
        await vi.waitFor(() =>
            expect(port.postMessage).toHaveBeenCalledTimes(3),
        );

        disconnectListeners[0]!();
        expect(uploader.ports.has(port as never)).toBe(false);
    });

    it('keeps a task that is currently processing', () => {
        const uploader = Object.create(Uploader.prototype) as Uploader;
        uploader.queuedTasks = {
            items: [makeTask('q1', 'processing')],
        } as never;
        uploader.processedTasks = [];
        uploader.ports = new Set();

        const messageListeners: Array<(msg: unknown) => void> = [];
        const port = {
            postMessage: vi.fn(),
            onMessage: {
                addListener: vi.fn((l: (msg: unknown) => void) => {
                    messageListeners.push(l);
                }),
            },
            onDisconnect: { addListener: vi.fn() },
        };

        uploader.handlePortConnection(port as never);
        messageListeners[0]!({ type: 'removeTask', id: 'q1' });
        expect(uploader.queuedTasks.items).toHaveLength(1);
    });

    it('retries failed tasks back into the queue', async () => {
        const uploader = Object.create(Uploader.prototype) as Uploader;
        uploader.queuedTasks = new Queue<UploadTask>();
        uploader.processedTasks = [{ ...makeTask('f1', 'failed'), retries: 3 }];
        uploader.ports = new Set();

        const messageListeners: Array<(msg: unknown) => void> = [];
        const port = {
            postMessage: vi.fn(),
            onMessage: {
                addListener: vi.fn((l: (msg: unknown) => void) => {
                    messageListeners.push(l);
                }),
            },
            onDisconnect: { addListener: vi.fn() },
        };

        uploader.handlePortConnection(port as never);
        messageListeners[0]!({ type: 'retryTask', id: 'f1' });
        expect(uploader.processedTasks).toEqual([]);
        expect(uploader.queuedTasks.items).toHaveLength(1);
        expect(uploader.queuedTasks.items[0]).toMatchObject({
            id: 'f1',
            status: 'queued',
            retries: 0,
        });
        await vi.waitFor(() =>
            expect(port.postMessage).toHaveBeenCalledTimes(2),
        );

        messageListeners[0]!({ type: 'retryTask', id: 'missing' });
        expect(uploader.queuedTasks.items).toHaveLength(1);
    });
});

describe('Uploader.computeHash', () => {
    it('ignores worker responses for other ids', async () => {
        const uploader = Object.create(Uploader.prototype) as Uploader;
        const listeners: Array<(e: unknown) => void> = [];
        const posted: Array<{ id: string; buffer: Uint8Array }> = [];
        uploader.hasherWorker = {
            postMessage: vi.fn((msg: { id: string; buffer: Uint8Array }) => {
                posted.push(msg);
            }),
            addEventListener: vi.fn(
                (_type: string, l: (e: unknown) => void) => {
                    listeners.push(l);
                },
            ),
            removeEventListener: vi.fn(),
        } as never;

        const pending = uploader.computeHash(new Blob(['pixels']));
        await vi.waitFor(() => expect(posted).toHaveLength(1));

        let settled = false;
        void pending.then(() => {
            settled = true;
        });

        // A stale response for another hash must not resolve this call.
        listeners[0]!({ data: { id: 'stale-id', hash: 'stale' } });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(settled).toBe(false);

        listeners[0]!({ data: { id: posted[0]!.id, hash: 'deadbeef' } });
        await expect(pending).resolves.toBe('deadbeef');
        expect(uploader.hasherWorker.removeEventListener).toHaveBeenCalled();
    });
});

describe('Uploader.sendUpdateToPorts', () => {
    it('broadcasts the same taskList shape to every port', () => {
        const uploader = Object.create(Uploader.prototype) as Uploader;
        uploader.queuedTasks = { items: [makeTask('q1', 'queued')] } as never;
        uploader.processedTasks = [makeTask('p1', 'duplicate')];
        const a = { postMessage: vi.fn() };
        const b = { postMessage: vi.fn() };
        uploader.ports = new Set([a, b] as never);

        uploader.sendUpdateToPorts();

        const expected = {
            type: 'taskList',
            queued: uploader.queuedTasks.items,
            processed: uploader.processedTasks,
        };
        expect(a.postMessage).toHaveBeenCalledWith(expected);
        expect(b.postMessage).toHaveBeenCalledWith(expected);
    });
});

describe('parseUploadResponse', () => {
    const jsonResponse = (status: number, body: unknown) =>
        ({
            status,
            json: async () => body,
        }) as unknown as Response;

    it('reads ok responses with the server upload id', async () => {
        await expect(
            parseUploadResponse(
                jsonResponse(200, {
                    status: 'ok',
                    hash: 'h1',
                    upload_id: 'u1',
                }),
            ),
        ).resolves.toEqual({ status: 'ok', hash: 'h1', upload_id: 'u1' });
    });

    it('reads 200 duplicates', async () => {
        await expect(
            parseUploadResponse(
                jsonResponse(200, { status: 'duplicate', hash: 'known' }),
            ),
        ).resolves.toEqual({ status: 'duplicate', hash: 'known' });
    });

    it('maps 400 duplicates to duplicate, other 400s to error', async () => {
        await expect(
            parseUploadResponse(
                jsonResponse(400, {
                    status: 'duplicate',
                    hash: 'known',
                    upload_id: '',
                }),
            ),
        ).resolves.toEqual({ status: 'duplicate', hash: 'known' });
        await expect(
            parseUploadResponse(
                jsonResponse(400, { status: 'error', message: 'bad file' }),
            ),
        ).resolves.toEqual({ status: 'error', message: 'bad file' });
    });

    it('retries unexpected HTTP statuses by throwing', async () => {
        await expect(
            parseUploadResponse(jsonResponse(500, { status: 'error' })),
        ).rejects.toThrow('HTTP 500');
    });
});
