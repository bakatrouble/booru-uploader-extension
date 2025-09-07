import ky from 'ky';

type RuntimeMessage = {
    type: 'fetchSubscriptions',
} | {
    type: 'addSubscription', tag: string,
} | {
    type: 'removeSubscription', tag: string,
}

export class SubscriptionsFetcher {
    subscriptions: string[] = [];
    ports = new Set<browser.runtime.Port>();

    constructor() {
        browser.runtime.onConnect.addListener(port => {
            if (port.name === 'subscriptions') {
                return this.handlePortConnection(port);
            }
            return false;
        });
        browser.runtime.onMessage.addListener(this.handleMessage)

        // noinspection JSIgnoredPromiseFromCall
        this.fetchSubscriptions();
        setInterval(() => this.fetchSubscriptions(), 10 * 60 * 1000); // every 10 minutes
    }

    get client() {
        return ky.create({
            prefixUrl: 'https://e621.bakatrouble.me/api',
            hooks: {
                beforeRequest: [
                    async (request) => {
                        const { apiKey } = await browser.storage.sync.get('apiKey');
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
        const { apiKey } = await browser.storage.sync.get('apiKey');
        if (!apiKey)
            return [];
        const { subscriptions } = await this.client.get('subscriptions').json() as { subscriptions: string[] };
        this.subscriptions = subscriptions;
        for (const port of this.ports) {
            port.postMessage({ subscriptions: this.subscriptions });
        }
    }

    handlePortConnection(port: browser.runtime.Port) {
        this.ports.add(port);

        port.postMessage({ subscriptions: this.subscriptions });

        port.onDisconnect.addListener(() => {
            this.ports.delete(port);
        });
    }

    handleMessage = (
        msg: RuntimeMessage,
        sender: browser.runtime.MessageSender,
        sendResponse: (response?: any) => void,
    ) => {
        switch (msg.type) {
            case 'fetchSubscriptions':
                this.fetchSubscriptions()
                    .finally(() => {
                        sendResponse(true);
                    });
                break;
            case 'addSubscription':
                this.client.post('subscriptions', { json: { subs: [msg.tag] } })
                    .then(() => this.fetchSubscriptions())
                    .finally(() => {
                        sendResponse(true);
                    });
                break;
            case 'removeSubscription':
                this.client.delete('subscriptions', { json: { subs: [msg.tag] } })
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
