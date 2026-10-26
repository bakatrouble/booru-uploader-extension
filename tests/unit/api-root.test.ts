import { describe, expect, it } from 'vitest';
import {
    DEFAULT_API_ROOT,
    normalizeApiRoot,
    resolveApiRoot,
} from '@/utils/apiRoot';

describe('resolveApiRoot', () => {
    it('prefers the stored value', () => {
        expect(resolveApiRoot('https://booru.example.test')).toBe(
            'https://booru.example.test',
        );
    });

    it('trims the stored value', () => {
        expect(resolveApiRoot('  https://booru.example.test/  ')).toBe(
            'https://booru.example.test/',
        );
    });

    it('falls back to the default when nothing is stored', () => {
        expect(resolveApiRoot(undefined)).toBe(DEFAULT_API_ROOT);
        expect(resolveApiRoot('')).toBe(DEFAULT_API_ROOT);
        expect(resolveApiRoot('   ')).toBe(DEFAULT_API_ROOT);
    });

    it('defaults to the local channel-helper instance', () => {
        expect(DEFAULT_API_ROOT).toBe('http://127.0.0.1:8080');
    });
});

describe('normalizeApiRoot', () => {
    it('strips trailing slashes for prefixUrl', () => {
        expect(normalizeApiRoot('http://127.0.0.1:8080/')).toBe(
            'http://127.0.0.1:8080',
        );
        expect(normalizeApiRoot('http://127.0.0.1:8080')).toBe(
            'http://127.0.0.1:8080',
        );
    });
});
