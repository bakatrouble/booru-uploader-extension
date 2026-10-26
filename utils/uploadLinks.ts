export const moveUploadLink = <T>(
    list: T[],
    index: number,
    direction: -1 | 1,
): boolean => {
    const target = index + direction;
    if (index < 0 || index >= list.length) return false;
    if (target < 0 || target >= list.length) return false;
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item!);
    return true;
};

/**
 * Upload destinations must be absolute http(s) URLs — anything else
 * fails at upload time with an unhelpful error. Used for the global
 * API root setting.
 */
export const isValidEndpointUrl = (value: string): boolean => {
    try {
        const url = new URL(value.trim());
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

/**
 * Drops the pre-migration `url` field: destinations are now just an API
 * key against the shared global API root.
 */
export const normalizeUploadLinks = (links: UploadLink[]): UploadLink[] =>
    links.map((link) => {
        const raw = link as unknown as Record<string, unknown>;
        const apiKey =
            typeof raw.apiKey === 'string' ? (raw.apiKey as string) : '';
        const { url: _dropped, ...rest } = raw;
        void _dropped;
        return { ...(rest as unknown as UploadLink), apiKey };
    });
