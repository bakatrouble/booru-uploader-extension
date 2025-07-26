export class Queue<T> {
    items: T[] = [];
    private listener?: (item: T) => any;

    put(item: T): void {
        this.items.push(item);
        if (this.listener) {
            this.listener(this.items[0]);
            this.listener = undefined;
        }
    }

    wait(): Promise<T> {
        if (this.listener) {
            throw new Error('Wait conflict');
        }
        return new Promise(resolve => {
            if (this.items.length > 0) {
                resolve(this.items[0]);
            } else {
                this.listener = resolve;
            }
        });
    }

    shift() {
        this.items.shift();
    }
}