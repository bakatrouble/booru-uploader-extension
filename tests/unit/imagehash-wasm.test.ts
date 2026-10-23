// @vitest-environment node
// Real round-trip through the compiled imagehash wasm glue. This is the
// only test that exercises the actual `&[u8]` binding (everything else
// stops at a mocked worker boundary) — it pins the byte-shape contract
// `computeHashWithWorker` depends on: the binding requires a Uint8Array
// view and silently hashes an empty slice for a bare ArrayBuffer.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';

type ImagehashModule = {
    default: (input: unknown) => Promise<unknown>;
    imagehash: (bytes: unknown) => string;
};

// 1x1 transparent PNG.
const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

let imagehash: ImagehashModule['imagehash'];

beforeAll(async () => {
    const require = createRequire(import.meta.url);
    const pkgDir = require
        .resolve('imagehash-rs/package.json')
        .replace(/package\.json$/, '');
    const mod = (await import('imagehash-rs')) as ImagehashModule;
    await mod.default(readFileSync(`${pkgDir}imagehash_bg.wasm`));
    imagehash = mod.imagehash;
}, 60_000);

describe('imagehash wasm binding', () => {
    it('hashes a Uint8Array view deterministically', () => {
        const first = imagehash(new Uint8Array(tinyPng));
        const second = imagehash(new Uint8Array(tinyPng));
        expect(first).toMatch(/^[0-9a-f]+$/);
        expect(first).toBe(second);
    });

    it('rejects a bare ArrayBuffer instead of hashing empty bytes', () => {
        // Regression test: the wasm glue reads `arg.length`, which is
        // undefined for a bare ArrayBuffer, so Rust receives an empty
        // slice. Never send anything but a view to the hasher worker.
        const logged: unknown[][] = [];
        const originalError = console.error;
        console.error = (...args: unknown[]) => {
            logged.push(args);
        };
        try {
            expect(() => imagehash(new Uint8Array(tinyPng).buffer)).toThrow();
        } finally {
            console.error = originalError;
        }
        expect(logged.flat().join('\n')).toMatch(
            /Failed to load image from bytes/,
        );
    });
});
