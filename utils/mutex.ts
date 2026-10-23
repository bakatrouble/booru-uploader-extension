/**
 * A minimal async mutex. `acquire()` resolves with a `release` function;
 * callers hold the lock until they invoke it. Waiters are served FIFO:
 * each acquirer appends to the tail chain synchronously, so even
 * same-tick acquirers queue correctly.
 */
export class Mutex {
    private tail: Promise<void> = Promise.resolve();

    async acquire(): Promise<() => void> {
        const previous = this.tail;
        let releaseTail!: () => void;
        this.tail = new Promise<void>((resolve) => {
            releaseTail = resolve;
        });
        await previous;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            releaseTail();
        };
    }
}
