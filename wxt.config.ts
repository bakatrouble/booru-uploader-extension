import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type WxtViteConfig } from 'wxt';

export const extensionSlug = 'uploader@bakatrouble.me';

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
        },
        worker: {
            format: 'es',
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
