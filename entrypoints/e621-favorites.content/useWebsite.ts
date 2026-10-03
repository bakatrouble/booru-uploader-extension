export const useWebsite = () => computed(() => {
    const hostname = document.location.hostname;
    if (hostname.includes('gelbooru.com')) {
        return 'gelbooru';
    } else if (hostname.includes('e621.net') || hostname.includes('e962.net')) {
        return 'e621';
    }
    return 'e621';
});