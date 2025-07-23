import { defineConfig } from 'wxt';

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
        browser_specific_settings: {
            gecko: {
                id: 'uploader@bakatrouble.me',
            },
        },
        externally_connectable: {
            ids: [
                'booru@bakatrouble.me',
            ],
        },
    },
});
