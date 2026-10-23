import { describe, expect, it } from 'vitest';
import { Mutex } from '@/utils/mutex';

describe('Mutex', () => {
    it('serializes concurrent holders FIFO', async () => {
        const mutex = new Mutex();
        const order: string[] = [];

        const first = mutex.acquire().then(async (release) => {
            order.push('first-acquired');
            await new Promise((resolve) => setTimeout(resolve, 10));
            order.push('first-releasing');
            release();
        });
        const second = mutex.acquire().then((release) => {
            order.push('second-acquired');
            release();
        });

        await Promise.all([first, second]);
        expect(order).toEqual([
            'first-acquired',
            'first-releasing',
            'second-acquired',
        ]);
    });

    it('ignores double release', async () => {
        const mutex = new Mutex();
        const release = await mutex.acquire();
        release();
        release();
        const order: string[] = [];
        await mutex.acquire().then((next) => {
            order.push('next');
            next();
        });
        expect(order).toEqual(['next']);
    });
});
