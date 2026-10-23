import { describe, expect, it } from 'vitest';
import { Queue } from '@/utils/queue';

describe('Queue', () => {
    it('resolves immediately when items are already queued', async () => {
        const queue = new Queue<string>();
        queue.put('a');
        queue.put('b');
        await expect(queue.wait()).resolves.toBe('a');
    });

    it('notifies a pending waiter on put', async () => {
        const queue = new Queue<string>();
        const pending = queue.wait();
        queue.put('x');
        await expect(pending).resolves.toBe('x');
    });

    it('does not consume on wait; shift advances the queue', async () => {
        const queue = new Queue<number>();
        queue.put(1);
        await expect(queue.wait()).resolves.toBe(1);
        // Still the first item until shifted.
        await expect(queue.wait()).resolves.toBe(1);
        queue.shift();
        const pending = queue.wait();
        queue.put(2);
        await expect(pending).resolves.toBe(2);
    });

    it('throws on a second concurrent waiter', () => {
        const queue = new Queue<string>();
        void queue.wait();
        expect(() => queue.wait()).toThrow('Wait conflict');
    });

    it('a waiter on an emptied queue is notified by the next put', async () => {
        const queue = new Queue<string>();
        queue.put('a');
        queue.shift();
        const pending = queue.wait();
        queue.put('b');
        await expect(pending).resolves.toBe('b');
    });
});
