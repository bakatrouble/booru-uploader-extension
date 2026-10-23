import { computed } from 'vue';

export type SupportedWebsite = 'gelbooru' | 'e621';

export const detectWebsite = (hostname: string): SupportedWebsite => {
    if (hostname.includes('gelbooru.com')) {
        return 'gelbooru';
    } else if (hostname.includes('e621.net') || hostname.includes('e962.net')) {
        return 'e621';
    }
    return 'e621';
};

export const useWebsite = () =>
    computed(() => detectWebsite(document.location.hostname));
