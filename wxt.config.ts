import { defineConfig, type WxtViteConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export const extensionSlug = 'uploader@bakatrouble.me';

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: [
        '@wxt-dev/module-vue',
        '@wxt-dev/auto-icons',
    ],
    autoIcons: {
        baseIconPath: 'public/default-icon.svg',
    },
    manifest: {
        permissions: ['storage', 'tabs', 'menus'],
        browser_specific_settings: {
            gecko: {
                id: extensionSlug,
            },
        },
    },
    zip: {
        excludeSources: [
            'web-ext-artifacts/**/*',
            'lib/imagehash/target/**/*',
        ],
    },
    vite: (): WxtViteConfig => ({
        plugins: [
            tailwindcss(),
        ],
        build: {
            sourcemap: false,
            minify: false,
            cssMinify: false,
        },
        worker: {
            format: 'es',
        },
    }),
});
