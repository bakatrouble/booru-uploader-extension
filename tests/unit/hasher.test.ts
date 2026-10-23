import { describe, expect, it, vi } from 'vitest';
import { computeHashWithWorker } from '@/entrypoints/background/hasher';

const makeWorker = () => {
    const listeners: Array<(e: unknown) => void> = [];
    return {
        listeners,
        postMessage: vi.fn(),
        addEventListener: vi.fn(
            (_type: string, listener: (e: unknown) => void) => {
                listeners.push(listener);
            },
        ),
        removeEventListener: vi.fn((..._args: unknown[]) => {
            const index = listeners.indexOf(_args[1] as (e: unknown) => void);
            if (index !== -1) listeners.splice(index, 1);
        }),
    };
};

describe('computeHashWithWorker', () => {
    it('transfers the buffer and resolves on the matching reply', async () => {
        const worker = makeWorker();
        const pending = computeHashWithWorker(
            worker as never,
            new Blob(['pixels']),
            1000,
        );
        await vi.waitFor(() =>
            expect(worker.postMessage).toHaveBeenCalledTimes(1),
        );
        const [message, transfer] = worker.postMessage.mock.calls[0]!;
        expect((message as { buffer: unknown }).buffer).toBeInstanceOf(
            ArrayBuffer,
        );
        expect(transfer).toEqual([(message as { buffer: ArrayBuffer }).buffer]);

        // Stale replies for other ids are ignored.
        worker.listeners[0]!({ data: { id: 'stale', hash: 'nope' } });
        worker.listeners[0]!({
            data: { id: (message as { id: string }).id, hash: 'deadbeef' },
        });
        await expect(pending).resolves.toBe('deadbeef');
    });

    it('rejects instead of hanging when the worker stays silent', async () => {
        const worker = makeWorker();
        await expect(
            computeHashWithWorker(worker as never, new Blob(['pixels']), 20),
        ).rejects.toThrow('Hash computation timed out');
        expect(worker.listeners).toEqual([]);
    });
});
