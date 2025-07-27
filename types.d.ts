import "wxt/browser";

declare module "wxt/browser" {
    export interface WxtRuntime {
        getURL(path: string): string;
    }
}
