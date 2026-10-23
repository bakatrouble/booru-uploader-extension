import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: [
            {
                find: /^@\//,
                replacement: `${path.resolve(__dirname)}/`,
            },
        ],
    },
    test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['tests/unit/setup.ts'],
        include: ['tests/unit/**/*.test.ts'],
        css: false,
        server: {
            deps: {
                inline: [/@vueuse/, /mdi-vue/],
            },
        },
    },
});
