import { describe, expect, it } from 'vitest';
import { isValidEndpointUrl, moveUploadLink } from '@/utils/uploadLinks';

describe('moveUploadLink', () => {
    it('moves an item up and down', () => {
        const list = ['a', 'b', 'c'];
        expect(moveUploadLink(list, 1, -1)).toBe(true);
        expect(list).toEqual(['b', 'a', 'c']);
        expect(moveUploadLink(list, 0, 1)).toBe(true);
        expect(list).toEqual(['a', 'b', 'c']);
    });

    it('refuses to move past either end', () => {
        const list = ['a', 'b'];
        expect(moveUploadLink(list, 0, -1)).toBe(false);
        expect(moveUploadLink(list, 1, 1)).toBe(false);
        expect(list).toEqual(['a', 'b']);
    });

    it('refuses out-of-range indexes', () => {
        const list = ['a'];
        expect(moveUploadLink(list, -1, 1)).toBe(false);
        expect(moveUploadLink(list, 5, -1)).toBe(false);
        expect(list).toEqual(['a']);
    });
});

describe('isValidEndpointUrl', () => {
    it('accepts absolute http(s) URLs', () => {
        expect(isValidEndpointUrl('https://example.test/hook')).toBe(true);
        expect(isValidEndpointUrl('http://localhost:8080/x')).toBe(true);
        expect(isValidEndpointUrl('  https://example.test/hook  ')).toBe(true);
    });

    it('rejects empty, relative and non-http(s) values', () => {
        expect(isValidEndpointUrl('')).toBe(false);
        expect(isValidEndpointUrl('not a url')).toBe(false);
        expect(isValidEndpointUrl('/relative/path')).toBe(false);
        expect(isValidEndpointUrl('ftp://example.test/x')).toBe(false);
        expect(isValidEndpointUrl('javascript:alert(1)')).toBe(false);
    });
});
