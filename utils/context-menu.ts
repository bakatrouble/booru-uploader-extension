import type { Uploader } from '../entrypoints/background/uploader';
import { NotificationLevel } from './enums';
import { normalizeUploadLinks } from './uploadLinks';

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

        this.uploadLinks = normalizeUploadLinks(
            (
                (await browser.storage.sync.get('uploadLinks')) as {
                    uploadLinks?: UploadLink[];
                }
            ).uploadLinks || [],
        );

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
                const apiKey = this.uploadLinks.find(
                    (uploadLink: UploadLink) =>
                        uploadLink.id ===
                        menuItemId.replace(MenuIds.Destination, ''),
                )?.apiKey;

                if (apiKey) {
                    let failure: unknown;
                    // Scope to the clicked frame: targetElementId is only
                    // valid there, and a tab-wide broadcast lets a sibling
                    // frame's "no such element" rejection win the race.
                    // (Firefox provides frameId at runtime; the type
                    // package just doesn't declare it.)
                    const frameId = (info as { frameId?: number }).frameId;
                    const frameOpts =
                        frameId !== undefined ? [{ frameId }] : [];
                    try {
                        const buffer: ArrayBuffer =
                            await browser.tabs.sendMessage(
                                tab.id,
                                {
                                    type: 'getImageMenusArrayBuffer',
                                    targetElementId: info.targetElementId,
                                },
                                ...frameOpts,
                            );
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
                                apiKey,
                            },
                            tab.id,
                            frameId,
                        );
                    } catch (e) {
                        failure = e;
                    }
                    if (failure !== undefined) {
                        // Covers an unreachable content script (chrome://
                        // pages, PDFs, …) as well as a failed render or
                        // upload: surface it instead of failing silent.
                        const reason =
                            failure instanceof Error
                                ? failure.message
                                : String(failure);
                        console.error(
                            '[context menu] upload failed for tab',
                            tab.id,
                            failure,
                        );
                        try {
                            await browser.tabs.sendMessage(
                                tab.id,
                                {
                                    type: 'notification',
                                    options: {
                                        level: NotificationLevel.Error,
                                        message: `Upload failed: ${reason}`,
                                    },
                                },
                                ...frameOpts,
                            );
                        } catch {
                            // The tab cannot even show the notification.
                        }
                    }
                }
            }
        }
    }
}
