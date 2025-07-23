export class Queue<T> {
    items: T[] = [];
    private listeners: (() => any)[] = [];

    put(item: T): void {
        this.items.push(item);
        while (true) {
            const listener = this.listeners.shift();
            if (!listener)
                break;
            listener();
        }
    }

    wait(): Promise<T> {
        return new Promise(resolve => {
            if (this.items.length > 0) {
                resolve(this.items[0]);
            } else {
                this.listeners.push(() => {
                    resolve(this.items[0]);
                });
            }
        });
    }

    shift() {
        this.items.shift();
    }
}