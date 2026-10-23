import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ky', () => ({
    default: {
        create: vi.fn(),
    },
}));

import ky from 'ky';
import {
    resolveApiKey,
    SubscriptionsFetcher,
} from '@/entrypoints/background/subscriptionsFetcher';
import { storageData } from './setup';

const kyResponse = <T>(payload: T) =>
    Object.assign(Promise.resolve(payload), {
        json: async () => payload,
    });

const mockedCreate = vi.mocked(ky.create);

const subscriptionsResponse = (subs: string[]) =>
    kyResponse({ subscriptions: subs });

const makePort = () => {
    const messageListeners: Array<(msg: unknown) => void> = [];
    const disconnectListeners: Array<() => void> = [];
    return {
        postMessage: vi.fn(),
        onMessage: { addListener: vi.fn() },
        onDisconnect: {
            addListener: vi.fn((l: () => void) => {
                disconnectListeners.push(l);
            }),
        },
        messageListeners,
        disconnectListeners,
    };
};

describe('resolveApiKey', () => {
    it('prefers the stored key', () => {
        expect(resolveApiKey('stored')).toBe('stored');
    });

    it('returns undefined without any key', () => {
        expect(resolveApiKey(undefined)).toBeUndefined();
        expect(resolveApiKey('')).toBeUndefined();
    });
});

describe('SubscriptionsFetcher', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('does no network without an api key', async () => {
        const fetcher = Object.create(
            SubscriptionsFetcher.prototype,
        ) as SubscriptionsFetcher;
        fetcher.subscriptions = {};
        fetcher.ports = new Set();
        await expect(fetcher.fetchSubscriptions()).resolves.toEqual([]);
        expect(mockedCreate).not.toHaveBeenCalled();
    });

    it('fetches both websites and notifies ports', async () => {
        storageData.apiKey = 'secret';
        const get = vi.fn((url: string) =>
            subscriptionsResponse(url.includes('e621') ? ['a'] : ['b']),
        );
        mockedCreate.mockReturnValue({ get } as never);

        const fetcher = Object.create(
            SubscriptionsFetcher.prototype,
        ) as SubscriptionsFetcher;
        fetcher.subscriptions = {};
        const port = makePort();
        fetcher.ports = new Set([port] as never);

        await fetcher.fetchSubscriptions();

        expect(get).toHaveBeenCalledWith('subscriptions?website=e621');
        expect(get).toHaveBeenCalledWith('subscriptions?website=gelbooru');
        expect(fetcher.subscriptions).toEqual({ e621: ['a'], gelbooru: ['b'] });
        expect(port.postMessage).toHaveBeenCalledWith({
            subscriptions: fetcher.subscriptions,
        });
    });

    it('addSubscription posts then refetches', async () => {
        storageData.apiKey = 'secret';
        const get = vi.fn(() => subscriptionsResponse([]));
        const post = vi.fn(() => kyResponse({}));
        mockedCreate.mockReturnValue({ get, post } as never);

        const fetcher = Object.create(
            SubscriptionsFetcher.prototype,
        ) as SubscriptionsFetcher;
        fetcher.subscriptions = {};
        fetcher.ports = new Set();

        const sendResponse = vi.fn();
        const handled = fetcher.handleMessage(
            { type: 'addSubscription', tag: 'cat', website: 'e621' },
            {} as never,
            sendResponse,
        );
        expect(handled).toBe(true);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(true));
        expect(post).toHaveBeenCalledWith('subscriptions?website=e621', {
            json: { subs: ['cat'] },
        });
        expect(get).toHaveBeenCalled();
    });

    it('removeSubscription deletes then refetches', async () => {
        storageData.apiKey = 'secret';
        const get = vi.fn(() => subscriptionsResponse([]));
        const del = vi.fn(() => kyResponse({}));
        mockedCreate.mockReturnValue({ get, delete: del } as never);

        const fetcher = Object.create(
            SubscriptionsFetcher.prototype,
        ) as SubscriptionsFetcher;
        fetcher.subscriptions = {};
        fetcher.ports = new Set();

        const sendResponse = vi.fn();
        const handled = fetcher.handleMessage(
            { type: 'removeSubscription', tag: 'dog', website: 'gelbooru' },
            {} as never,
            sendResponse,
        );
        expect(handled).toBe(true);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(true));
        expect(del).toHaveBeenCalledWith('subscriptions?website=gelbooru', {
            json: { subs: ['dog'] },
        });
    });

    it('returns false for unknown messages', () => {
        const fetcher = Object.create(
            SubscriptionsFetcher.prototype,
        ) as SubscriptionsFetcher;
        expect(
            fetcher.handleMessage(
                { type: 'nope' } as never,
                {} as never,
                vi.fn(),
            ),
        ).toBe(false);
    });

    it('handlePortConnection publishes state and tracks disconnects', () => {
        const fetcher = Object.create(
            SubscriptionsFetcher.prototype,
        ) as SubscriptionsFetcher;
        fetcher.subscriptions = { e621: ['a'] };
        fetcher.ports = new Set();

        const port = makePort();
        fetcher.handlePortConnection(port as never);

        expect(fetcher.ports.has(port as never)).toBe(true);
        expect(port.postMessage).toHaveBeenCalledWith({
            subscriptions: fetcher.subscriptions,
        });

        port.disconnectListeners[0]!();
        expect(fetcher.ports.has(port as never)).toBe(false);
    });
});
