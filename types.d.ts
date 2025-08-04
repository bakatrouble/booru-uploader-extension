import "wxt/browser";
import { HTMLImageElement } from 'linkedom';

declare module "wxt/browser" {
    export interface WxtRuntime {
        getURL(path: string): string;
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

    type RuntimeMessage = {
        type: 'notification',
        options: NotificationOptions,
    } | {
        type: 'update-notification',
        options: UpdateNotificationOptions,
    };

    interface UploadLink {
        id: string,
        name: string;
        shortName: string;
        url: string;
        hotkey: string[];
    }
}
