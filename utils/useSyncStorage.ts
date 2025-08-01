import { useStorageAsync } from '@vueuse/core';

export const useSyncStorage = <T>(key: string, initialValue: T) => {
    const ready = ref(false);
    const storage = useStorageAsync(key, initialValue, {
        getItem: key => browser.storage.sync.get(key).then(result => result[key]),
        setItem: (key, value) => browser.storage.sync.set({ [key]: value }),
        removeItem: key => browser.storage.sync.remove(key),
    }, { onReady: () => ready.value = true });
    return {
        storage,
        ready,
    }
}
