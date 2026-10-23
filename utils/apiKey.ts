/**
 * Resolves the backend API key: stored value first, build-time fallback
 * second. Returns `undefined` when neither is set.
 */
export const resolveApiKey = (stored: unknown): string | undefined => {
    if (typeof stored === 'string' && stored) {
        return stored;
    }
    return import.meta.env.VITE_API_KEY || undefined;
};
