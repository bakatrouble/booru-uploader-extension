import { describe, expect, it } from 'vitest';
import { detectWebsite } from '@/entrypoints/e621-favorites.content/useWebsite';

describe('detectWebsite', () => {
    it('resolves e621 hosts', () => {
        expect(detectWebsite('e621.net')).toBe('e621');
        expect(detectWebsite('www.e621.net')).toBe('e621');
        expect(detectWebsite('e962.net')).toBe('e621');
    });

    it('resolves gelbooru hosts', () => {
        expect(detectWebsite('gelbooru.com')).toBe('gelbooru');
        expect(detectWebsite('www.gelbooru.com')).toBe('gelbooru');
    });

    it('falls back to e621 for unknown hosts', () => {
        // e926 has no explicit branch; the default covers it.
        expect(detectWebsite('e926.net')).toBe('e621');
        expect(detectWebsite('example.com')).toBe('e621');
    });

    it('matches gelbooru by substring, including lookalikes', () => {
        // Documents current behavior: substring matching over-matches.
        // See improvements list for a stricter alternative.
        expect(detectWebsite('evilgelbooru.com')).toBe('gelbooru');
    });
});
