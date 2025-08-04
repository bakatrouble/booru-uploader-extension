import { Uploader } from '@/entrypoints/background';

enum MenuIds {
    Prefix = 'send-to-tg-',
    Root = `${Prefix}root`,
    Settings = `${Prefix}settings`,
    Destination = `${Prefix}dst-`,
    Separator = `${Prefix}separator-`,
}

export class ContextMenuManager {
    uploadLinks: UploadLink[] = [];
    initialized = false;

    constructor(private uploader: Uploader) {
        // noinspection JSIgnoredPromiseFromCall
        this.init();
    }

    async init() {
        if (this.initialized) {
            try {
                await browser.menus.remove(MenuIds.Root);
            } catch (e) {
                console.warn(e);
            }
        }

        this.uploadLinks = (await browser.storage.sync.get('uploadLinks')).uploadLinks || [];

        browser.menus.create({
            id: MenuIds.Root,
            contexts: ['image'],
            title: 'Send to Telegram',
        });

        this.uploadLinks.forEach((uploadLink: UploadLink) => {
            browser.menus.create({
                id: MenuIds.Destination + uploadLink.id,
                parentId: MenuIds.Root,
                contexts: ['image'],
                title: uploadLink.name,
            });
        });

        browser.menus.create({
            id: MenuIds.Separator,
            type: 'separator',
            contexts: ['image'],
            parentId: MenuIds.Root,
        });

        browser.menus.create({
            id: MenuIds.Settings,
            parentId: MenuIds.Root,
            contexts: ['image'],
            title: 'Settings',
        });

        browser.menus.onClicked.addListener((info, tab) => this.callback(info, tab));

        this.initialized = true;
    }

    async callback(info: browser.menus.OnClickData, tab?: browser.tabs.Tab) {
        if (info.targetElementId && tab?.id) {
            const menuItemId = info.menuItemId as unknown as string;
            if (!menuItemId || !menuItemId?.startsWith(MenuIds.Prefix)) return;
            if (menuItemId === MenuIds.Settings) {
                await browser.runtime.openOptionsPage();
                return;
            } else if (menuItemId.startsWith(MenuIds.Destination)) {
                const url = this.uploadLinks.find((uploadLink: UploadLink) => uploadLink.id === menuItemId.replace(MenuIds.Destination, ''))?.url;

                if (url) {
                    const dataUrl = await browser.tabs.sendMessage(tab.id, {
                        type: 'getImageMenusBase64',
                        targetElementId: info.targetElementId,
                    });
                    console.log('[context menu background script] dataUrl:', dataUrl);
                    await this.uploader.handleMessage({
                        type: 'upload',
                        method: 'photoBase64',
                        data: dataUrl,
                        endpoint: url,
                    }, tab.id);
                }
            }
        }
    }
}
