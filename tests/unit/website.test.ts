import { describe, expect, it } from 'vitest';
import { detectWebsite } from '@/entrypoints/e621-favorites.content/useWebsite';

describe('detectWebsite', () => {
    it('resolves e621 hosts', () => {
        expect(detectWebsite('e621.net')).toBe('e621');
        expect(detectWebsite('www.e621.net')).toBe('e621');
        expect(detectWebsite('e962.net')).toBe('e621');
    });

    it('resolves gelbooru hosts and subdomains', () => {
        expect(detectWebsite('gelbooru.com')).toBe('gelbooru');
        expect(detectWebsite('www.gelbooru.com')).toBe('gelbooru');
    });

    it('falls back to e621 for unknown hosts', () => {
        // e926 has no explicit branch; the default covers it.
        expect(detectWebsite('e926.net')).toBe('e621');
        expect(detectWebsite('example.com')).toBe('e621');
    });

    it('does not match lookalike domains', () => {
        expect(detectWebsite('evilgelbooru.com')).toBe('e621');
        expect(detectWebsite('gelbooru.com.evil.com')).toBe('e621');
        expect(detectWebsite('notgelbooru.com')).toBe('e621');
    });
});
