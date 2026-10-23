import { describe, expect, it } from 'vitest';
import { Semaphore } from '@/utils/semaphore';

describe('Semaphore', () => {
    it('rejects non-positive limits', () => {
        expect(() => new Semaphore(0)).toThrow(RangeError);
        expect(() => new Semaphore(-2)).toThrow(RangeError);
    });

    it('allows up to the limit concurrently', async () => {
        const semaphore = new Semaphore(3);
        const releases = await Promise.all([
            semaphore.acquire(),
            semaphore.acquire(),
            semaphore.acquire(),
        ]);
        expect(releases).toHaveLength(3);

        let fourth = false;
        const fourthPending = semaphore.acquire().then((release) => {
            fourth = true;
            release();
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(fourth).toBe(false);

        releases[0]!();
        await fourthPending;
        expect(fourth).toBe(true);
        releases[1]!();
        releases[2]!();
    });

    it('serves waiters FIFO', async () => {
        const semaphore = new Semaphore(1);
        const order: string[] = [];
        const first = await semaphore.acquire();

        const second = semaphore.acquire().then((release) => {
            order.push('second');
            release();
        });
        const third = semaphore.acquire().then((release) => {
            order.push('third');
            release();
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        first();
        await second;
        await third;
        expect(order).toEqual(['second', 'third']);
    });

    it('ignores double release', async () => {
        const semaphore = new Semaphore(1);
        const release = await semaphore.acquire();
        release();
        release();
        const order: string[] = [];
        await semaphore.acquire().then((next) => {
            order.push('next');
            next();
        });
        expect(order).toEqual(['next']);
    });
});
