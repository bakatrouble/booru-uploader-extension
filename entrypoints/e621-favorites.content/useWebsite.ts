import { computed } from 'vue';

export type SupportedWebsite = 'gelbooru' | 'e621';

const GELBOORU_DOMAINS = ['gelbooru.com'];
const E621_DOMAINS = ['e621.net', 'e926.net'];

const matchesDomain = (hostname: string, domain: string) =>
    hostname === domain || hostname.endsWith(`.${domain}`);

/**
 * Resolves the supported website for a hostname. Matches exact hosts and
 * subdomains only, so lookalike domains (e.g. `evilgelbooru.com`) fall
 * through to the default instead of matching by substring.
 */
export const detectWebsite = (hostname: string): SupportedWebsite => {
    if (GELBOORU_DOMAINS.some((domain) => matchesDomain(hostname, domain))) {
        return 'gelbooru';
    }
    if (E621_DOMAINS.some((domain) => matchesDomain(hostname, domain))) {
        return 'e621';
    }
    return 'e621';
};

export const useWebsite = () =>
    computed(() => detectWebsite(document.location.hostname));
