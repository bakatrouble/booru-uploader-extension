import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { defineConfig, type WxtViteConfig } from 'wxt';

export const extensionSlug = 'uploader@bakatrouble.me';

/**
 * The prebuilt wasm-pack glue (`imagehash/pkg/imagehash.js`) references
 * its binary via `new URL('imagehash_bg.wasm', import.meta.url)`. WXT
 * builds entrypoints in Vite lib mode, which inlines every asset and
 * ignores `assetsInlineLimit` — embedding a second ~1MB base64 copy that
 * is never even executed (we always pass `module_or_path` explicitly).
 * Neuter that reference so the glue stays a plain runtime default.
 */
const wasmNoInline = (): Plugin => ({
    name: 'wasm-no-inline',
    enforce: 'pre',
    transform(code, id) {
        if (id.includes('imagehash')) {
            console.log('[wasm-no-inline] sees:', JSON.stringify(id));
        }
        if (!id.endsWith('imagehash/pkg/imagehash.js')) return null;
        const from = `new URL('imagehash_bg.wasm', import.meta.url)`;
        if (!code.includes(from)) {
            this.warn(
                'wasm-no-inline: pattern not found, the wasm may be inlined as base64',
            );
            return null;
        }
        return code
            .split(from)
            .join(
                `new URL(/* @vite-ignore */'imagehash_bg.wasm', import.meta.url)`,
            );
    },
});

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-vue', '@wxt-dev/auto-icons'],
    autoIcons: {
        baseIconPath: 'public/default-icon.svg',
    },
    zip: {
        excludeSources: ['lib/imagehash/target/**/*'],
    },
    filterEntrypoints: [
        'image-getter',
        'background',
        'options',
        'popup',
        'notifications',
        'e621-favorites',
    ].concat(
        process.env.NODE_ENV === 'development'
            ? ['notifications-test-page']
            : [],
    ),
    vite: (): WxtViteConfig => ({
        plugins: [tailwindcss()],
        build: {
            sourcemap: false,
            minify: false,
            cssMinify: false,
            // Never inline assets as base64 data URLs. Note this alone is
            // not enough: entrypoints build in Vite lib mode, which inlines
            // every asset regardless of this limit. `?url&no-inline` below
            // and the wasmNoInline worker plugin cover the wasm binary.
            assetsInlineLimit: 0,
        },
        worker: {
            format: 'es',
            // NOTE: `?worker` bundles are built separately and only run
            // `worker.plugins` — main `plugins` do not apply to them.
            plugins: () => [wasmNoInline()],
        },
    }),
    manifest: {
        permissions: ['storage', 'tabs', 'menus'],
        web_accessible_resources: [
            {
                // encode-worker.js: JPEG upload rendering off the main
                // thread; instantiated from the content script via
                // browser.runtime.getURL (needs explicit listing).
                resources: ['encode-worker.js'],
                matches: ['*://*/*'],
            },
        ],
        browser_specific_settings: {
            gecko: {
                id: extensionSlug,
                data_collection_permissions: {
                    required: ['none'],
                },
            },
        },
    },
});
