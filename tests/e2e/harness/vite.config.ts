import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [vue(), tailwindcss()],
    resolve: {
        alias: {
            '@': `${import.meta.dirname}/../../..`,
        },
    },
    server: {
        port: 5200,
        strictPort: true,
    },
});
