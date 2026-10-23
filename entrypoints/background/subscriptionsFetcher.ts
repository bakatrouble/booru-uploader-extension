import ky from 'ky';

type RuntimeMessage =
    | {
          type: 'fetchSubscriptions';
      }
    | {
          type: 'addSubscription';
          tag: string;
          website: string;
      }
    | {
          type: 'removeSubscription';
          tag: string;
          website: string;
      };

export const resolveApiKey = (stored: unknown): string | undefined => {
    if (typeof stored === 'string' && stored) {
        return stored;
    }
    return import.meta.env.VITE_API_KEY || undefined;
};

export class SubscriptionsFetcher {
    subscriptions: Record<string, string[]> = {};
    ports = new Set<Browser.runtime.Port>();

    constructor() {
        browser.runtime.onConnect.addListener((port) => {
            if (port.name === 'subscriptions') {
                return this.handlePortConnection(port);
            }
            return false;
        });
        browser.runtime.onMessage.addListener((msg, sender, sendResponse) =>
            this.handleMessage(msg, sender, sendResponse),
        );

        // noinspection JSIgnoredPromiseFromCall
        this.fetchSubscriptions();
        setInterval(() => this.fetchSubscriptions(), 10 * 60 * 1000); // every 10 minutes
    }

    get client() {
        return ky.create({
            prefix: 'https://e621.bakatrouble.me/api',
            hooks: {
                beforeRequest: [
                    async ({ request }) => {
                        const { apiKey: stored } =
                            await browser.storage.sync.get('apiKey');
                        const apiKey = resolveApiKey(stored);
                        if (apiKey) {
                            request.headers.set('X-API-Key', apiKey);
                        } else {
                            throw new Error('No API key set');
                        }
                    },
                ],
            },
        });
    }

    async fetchSubscriptions() {
        const { apiKey: storedApiKey } =
            await browser.storage.sync.get('apiKey');
        const apiKey = resolveApiKey(storedApiKey);
        if (!apiKey) return [];
        const [{ subscriptions: e621 }, { subscriptions: gelbooru }] =
            await Promise.all([
                this.client
                    .get('subscriptions?website=e621')
                    .json<{ subscriptions: string[] }>(),
                this.client
                    .get('subscriptions?website=gelbooru')
                    .json<{ subscriptions: string[] }>(),
            ]);
        this.subscriptions.e621 = e621;
        this.subscriptions.gelbooru = gelbooru;
        for (const port of this.ports) {
            port.postMessage({ subscriptions: this.subscriptions });
        }
    }

    handlePortConnection(port: Browser.runtime.Port) {
        this.ports.add(port);

        port.postMessage({ subscriptions: this.subscriptions });

        port.onDisconnect.addListener(() => {
            this.ports.delete(port);
        });
    }

    handleMessage(
        msg: RuntimeMessage,
        _sender: Browser.runtime.MessageSender,
        sendResponse: (response?: any) => void,
    ) {
        switch (msg.type) {
            case 'fetchSubscriptions':
                this.fetchSubscriptions().finally(() => {
                    sendResponse(true);
                });
                break;
            case 'addSubscription':
                this.client
                    .post(`subscriptions?website=${msg.website}`, {
                        json: { subs: [msg.tag] },
                    })
                    .then(() => this.fetchSubscriptions())
                    .finally(() => {
                        sendResponse(true);
                    });
                break;
            case 'removeSubscription':
                this.client
                    .delete(`subscriptions?website=${msg.website}`, {
                        json: { subs: [msg.tag] },
                    })
                    .then(() => this.fetchSubscriptions())
                    .finally(() => {
                        sendResponse(true);
                    });
                break;
            default:
                return false;
        }
        return true;
    }
}
