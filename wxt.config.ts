import { defineConfig, WxtViteConfig } from 'wxt';
import vuetify from 'vite-plugin-vuetify';

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
                id: 'uploader@bakatrouble.me',
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
            // @ts-ignore
            vuetify({
                autoImport: true,
                styles: 'sass',
            }),
        ],
        build: {
            sourcemap: true,
            minify: false,
            cssMinify: false,
        },
        ssr: {
            noExternal: ['vuetify'],
        },
        worker: {
            format: 'es',
        },
    }),
});
