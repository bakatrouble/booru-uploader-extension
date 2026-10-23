import type { Uploader } from '../entrypoints/background/uploader';

export const MenuIds = {
    Prefix: 'send-to-tg-',
    Root: 'send-to-tg-root',
    Settings: 'send-to-tg-settings',
    Destination: 'send-to-tg-dst-',
    Separator: 'send-to-tg-separator-',
} as const;

export class ContextMenuManager {
    uploadLinks: UploadLink[] = [];
    initialized = false;

    private clickListener = (
        info: Browser.menus.OnClickData,
        tab?: Browser.tabs.Tab,
    ) => this.callback(info, tab);

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

        this.uploadLinks =
            (
                (await browser.storage.sync.get('uploadLinks')) as {
                    uploadLinks?: UploadLink[];
                }
            ).uploadLinks || [];

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

        // Re-registering without removing first would stack duplicate
        // click handlers (one per updateContextMenu call).
        browser.menus.onClicked.removeListener(this.clickListener);
        browser.menus.onClicked.addListener(this.clickListener);

        this.initialized = true;
    }

    async callback(info: Browser.menus.OnClickData, tab?: Browser.tabs.Tab) {
        if (info.targetElementId && tab?.id) {
            const menuItemId = info.menuItemId as unknown as string;
            if (!menuItemId?.startsWith(MenuIds.Prefix)) return;
            if (menuItemId === MenuIds.Settings) {
                await browser.runtime.openOptionsPage();
                return;
            } else if (menuItemId.startsWith(MenuIds.Destination)) {
                const url = this.uploadLinks.find(
                    (uploadLink: UploadLink) =>
                        uploadLink.id ===
                        menuItemId.replace(MenuIds.Destination, ''),
                )?.url;

                if (url) {
                    let buffer: ArrayBuffer;
                    try {
                        buffer = await browser.tabs.sendMessage(tab.id, {
                            type: 'getImageMenusArrayBuffer',
                            targetElementId: info.targetElementId,
                        });
                    } catch (e) {
                        // No content script in the tab (chrome:// pages,
                        // PDFs, …) or the render failed: nothing to upload.
                        console.error(
                            '[context menu] cannot get image bytes from tab',
                            tab.id,
                            e,
                        );
                        return;
                    }
                    console.log(
                        '[context menu background script] bytes:',
                        buffer?.byteLength,
                    );
                    await this.uploader.handleMessage(
                        {
                            type: 'upload',
                            method: 'photoArrayBuffer',
                            data: buffer,
                            mimeType: 'image/jpeg',
                            endpoint: url,
                        },
                        tab.id,
                    );
                }
            }
        }
    }
}
