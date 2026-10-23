import { type StorageLikeAsync, useStorageAsync } from '@vueuse/core';
import { ref } from 'vue';

/**
 * `browser.storage.sync` stores native values, while vueuse's async
 * storage layer is string-based (it JSON-encodes objects on write).
 * Normalize on read so values stored by older versions of this extension
 * (native objects) keep working alongside the new JSON strings.
 */
export const browserSyncStorage: StorageLikeAsync = {
    getItem: async (key) => {
        const result = await browser.storage.sync.get(key);
        const value: unknown = result[key];
        if (value == null) return null;
        return typeof value === 'string' ? value : JSON.stringify(value);
    },
    setItem: (key, value) => browser.storage.sync.set({ [key]: value }),
    removeItem: (key) => browser.storage.sync.remove(key),
};

export const useSyncStorage = <T>(key: string, initialValue: T) => {
    const ready = ref(false);
    const storage = useStorageAsync(key, initialValue, browserSyncStorage, {
        onReady: () => (ready.value = true),
    });
    return {
        storage,
        ready,
    };
};
