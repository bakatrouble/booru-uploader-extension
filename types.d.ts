import 'wxt/browser';

declare module 'wxt/browser' {
    export interface WxtRuntime {
        getURL(path: string): string;
    }

    namespace Browser {
        namespace contextMenus {
            // Firefox-only API, missing from the Chromium-derived base
            // types. Firefox exposes `contextMenus` as an alias of `menus`.
            function getTargetElement(
                targetElementId: number,
            ): Element | undefined;

            interface OnClickData {
                // Firefox-only: set when the click has a target element.
                targetElementId?: number;
            }
        }
    }
}
declare global {
    interface NotificationEntry extends NotificationOptions {
        visible: boolean;
        id: string;
    }

    interface UpdateNotificationOptions extends NotificationOptions {
        id: string;
    }

    interface NotificationOptions {
        level: NotificationLevel;
        title?: string;
        message: string;
    }

    type RuntimeMessage =
        | {
              type: 'notification';
              options: NotificationOptions;
          }
        | {
              type: 'update-notification';
              options: UpdateNotificationOptions;
          };

    interface UploadLink {
        id: string;
        name: string;
        shortName: string;
        url: string;
        hotkey: string[];
    }
}
