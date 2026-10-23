import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useSyncStorage } from '@/utils/useSyncStorage';
import { storageData } from './setup';

describe('useSyncStorage', () => {
    it('loads natively stored objects from previous versions', async () => {
        storageData.uploadLinks = [{ id: 'l1' }];

        const { storage, ready } = useSyncStorage<{ id: string }[]>(
            'uploadLinks',
            [],
        );
        await vi.waitFor(() => expect(ready.value).toBe(true));
        expect(storage.value).toEqual([{ id: 'l1' }]);
    });

    it('round-trips values through JSON strings', async () => {
        const { storage, ready } = useSyncStorage<{ id: string }[]>(
            'uploadLinks',
            [],
        );
        await vi.waitFor(() => expect(ready.value).toBe(true));

        storage.value = [{ id: 'l2' }];
        await nextTick();
        await vi.waitFor(() =>
            expect(storageData.uploadLinks).toBe(
                JSON.stringify([{ id: 'l2' }]),
            ),
        );

        const reloaded = useSyncStorage<{ id: string }[]>('uploadLinks', []);
        await vi.waitFor(() => expect(reloaded.ready.value).toBe(true));
        expect(reloaded.storage.value).toEqual([{ id: 'l2' }]);
    });

    it('falls back to the default without stored data', async () => {
        const { storage, ready } = useSyncStorage('initialTab', 0);
        await vi.waitFor(() => expect(ready.value).toBe(true));
        expect(storage.value).toBe(0);
    });
});
