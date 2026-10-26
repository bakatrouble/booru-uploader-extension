import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenuManager, MenuIds } from '@/utils/context-menu';
import {
    getMenusClickListener,
    getMenusClickListenerCount,
    storageData,
    stubBrowser,
} from './setup';

const makeManager = () => {
    const uploader = { handleMessage: vi.fn(async () => ({})) };
    const manager = new ContextMenuManager(uploader as never);
    return { manager, uploader };
};

const flushInit = () =>
    vi.waitFor(() => expect(stubBrowser.menus.create).toHaveBeenCalled());

describe('ContextMenuManager.init', () => {
    beforeEach(() => {
        storageData.uploadLinks = [
            { id: 'l1', name: 'First', apiKey: 'key-one' },
            { id: 'l2', name: 'Second', apiKey: 'key-two' },
        ];
    });

    it('builds root, per-link, separator and settings entries', async () => {
        const { manager } = makeManager();
        await flushInit();
        await manager.init();

        const created = stubBrowser.menus.create.mock.calls.map(
            (call) => call[0],
        );
        expect(created).toContainEqual(
            expect.objectContaining({
                id: MenuIds.Root,
                contexts: ['image'],
            }),
        );
        expect(created).toContainEqual(
            expect.objectContaining({
                id: `${MenuIds.Destination}l1`,
                parentId: MenuIds.Root,
                title: 'First',
            }),
        );
        expect(created).toContainEqual(
            expect.objectContaining({
                id: `${MenuIds.Destination}l2`,
                title: 'Second',
            }),
        );
        expect(created).toContainEqual(
            expect.objectContaining({ id: MenuIds.Settings }),
        );
        expect(manager.uploadLinks).toHaveLength(2);
    });

    it('re-init removes the previous root menu', async () => {
        const { manager } = makeManager();
        await flushInit();
        await manager.init();
        expect(stubBrowser.menus.remove).toHaveBeenCalledWith(MenuIds.Root);
    });

    it('re-init does not stack click listeners', async () => {
        const { manager } = makeManager();
        await flushInit();
        await manager.init();
        await manager.init();
        expect(getMenusClickListenerCount()).toBe(1);
        expect(stubBrowser.menus.onClicked.removeListener).toHaveBeenCalled();
    });
});

describe('ContextMenuManager.callback', () => {
    beforeEach(() => {
        storageData.uploadLinks = [
            { id: 'l1', name: 'First', apiKey: 'key-one' },
        ];
    });

    it('ignores clicks without a target element', async () => {
        const { manager, uploader } = makeManager();
        await flushInit();
        await manager.callback(
            { menuItemId: `${MenuIds.Destination}l1` } as never,
            undefined,
        );
        expect(uploader.handleMessage).not.toHaveBeenCalled();
    });

    it('ignores menu ids outside this extension', async () => {
        const { manager, uploader } = makeManager();
        await flushInit();
        await manager.callback(
            { menuItemId: 'other-extension-item', targetElementId: 5 } as never,
            { id: 9 } as never,
        );
        expect(uploader.handleMessage).not.toHaveBeenCalled();
    });

    it('opens the options page for the settings entry', async () => {
        const { manager, uploader } = makeManager();
        await flushInit();
        await manager.callback(
            { menuItemId: MenuIds.Settings, targetElementId: 5 } as never,
            { id: 9 } as never,
        );
        expect(stubBrowser.runtime.openOptionsPage).toHaveBeenCalled();
        expect(uploader.handleMessage).not.toHaveBeenCalled();
    });

    it('forwards a destination click as an ArrayBuffer upload', async () => {
        const { manager, uploader } = makeManager();
        await flushInit();
        const buffer = new Uint8Array([1, 2, 3]).buffer;
        stubBrowser.tabs.sendMessage.mockResolvedValueOnce(buffer);
        await manager.callback(
            {
                menuItemId: `${MenuIds.Destination}l1`,
                targetElementId: 5,
            } as never,
            { id: 9 } as never,
        );
        expect(stubBrowser.tabs.sendMessage).toHaveBeenCalledWith(9, {
            type: 'getImageMenusArrayBuffer',
            targetElementId: 5,
        });
        expect(uploader.handleMessage).toHaveBeenCalledWith(
            {
                type: 'upload',
                method: 'photoArrayBuffer',
                data: buffer,
                mimeType: 'image/jpeg',
                apiKey: 'key-one',
            },
            9,
        );
    });

    it('does nothing for an unknown destination id', async () => {
        const { manager, uploader } = makeManager();
        await flushInit();
        await manager.callback(
            {
                menuItemId: `${MenuIds.Destination}missing`,
                targetElementId: 5,
            } as never,
            { id: 9 } as never,
        );
        expect(uploader.handleMessage).not.toHaveBeenCalled();
    });

    it('ignores tabs without a reachable content script', async () => {
        const { manager, uploader } = makeManager();
        await flushInit();
        stubBrowser.tabs.sendMessage.mockRejectedValueOnce(
            new Error('No content script'),
        );
        await manager.callback(
            {
                menuItemId: `${MenuIds.Destination}l1`,
                targetElementId: 5,
            } as never,
            { id: 9 } as never,
        );
        expect(uploader.handleMessage).not.toHaveBeenCalled();
    });

    it('notifies the user when encoding or upload fails', async () => {
        const { manager, uploader } = makeManager();
        await flushInit();
        const buffer = new Uint8Array([1, 2, 3]).buffer;
        stubBrowser.tabs.sendMessage.mockResolvedValueOnce(buffer);
        uploader.handleMessage.mockRejectedValueOnce(
            new Error('JPEG worker failed'),
        );
        await manager.callback(
            {
                menuItemId: `${MenuIds.Destination}l1`,
                targetElementId: 5,
            } as never,
            { id: 9 } as never,
        );
        expect(stubBrowser.tabs.sendMessage).toHaveBeenCalledWith(9, {
            type: 'notification',
            options: {
                level: 'error',
                message: 'Upload failed: JPEG worker failed',
            },
        });
    });

    it('registers the callback on the menus click event', async () => {
        const { manager } = makeManager();
        await flushInit();
        expect(getMenusClickListener()).toBeDefined();
        expect(manager.initialized).toBe(true);
    });
});
