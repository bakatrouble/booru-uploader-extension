/**
 * Global API root for the channel-helper backend (see
 * `http://127.0.0.1:8080/openapi.yaml`). Every upload destination shares
 * this root; destinations differ only by their `x-key` API key.
 */
export const DEFAULT_API_ROOT = 'http://127.0.0.1:8080';

/** Stored value wins, build-time fallback second, hard default last. */
export const resolveApiRoot = (stored: unknown): string => {
    if (typeof stored === 'string' && stored.trim()) {
        return stored.trim();
    }
    const fromEnv =
        typeof import.meta !== 'undefined'
            ? (import.meta.env?.VITE_API_ROOT as string | undefined)
            : undefined;
    if (fromEnv?.trim()) return fromEnv.trim();
    return DEFAULT_API_ROOT;
};

export const getApiRoot = async (): Promise<string> => {
    try {
        const { apiRoot } = (await browser.storage.sync.get('apiRoot')) as {
            apiRoot?: unknown;
        };
        return resolveApiRoot(apiRoot);
    } catch {
        return resolveApiRoot(undefined);
    }
};

/** `ky` `prefixUrl`-safe base: no trailing slashes. */
export const normalizeApiRoot = (root: string): string =>
    root.trim().replace(/\/+$/, '');
