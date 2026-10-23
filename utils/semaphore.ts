/**
 * A counting semaphore with FIFO waiters. Up to `limit` holders may
 * hold the semaphore concurrently; further acquirers queue in order.
 * Permits are transferred directly to the next waiter on release.
 */
export class Semaphore {
    private available: number;
    private readonly waiters: Array<() => void> = [];

    constructor(limit: number) {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new RangeError('Semaphore limit must be at least 1');
        }
        this.available = limit;
    }

    async acquire(): Promise<() => void> {
        if (this.available > 0) {
            this.available -= 1;
        } else {
            await new Promise<void>((resolve) => {
                this.waiters.push(resolve);
            });
        }
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const next = this.waiters.shift();
            if (next) {
                next();
            } else {
                this.available += 1;
            }
        };
    }
}
