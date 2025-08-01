import { defineConfig, WxtViteConfig } from 'wxt';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const PYODIDE_PACKAGES = [
    'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl',
    'openblas-0.3.26.zip',
    'pillow-11.2.1-cp313-cp313-pyodide_2025_0_wasm32.whl',
    'pyscripts.zip',
    'scipy-1.14.1-cp313-cp313-pyodide_2025_0_wasm32.whl',
];

const viteStaticCopyPyodide = () => {
    const pyodideDir = dirname(fileURLToPath(import.meta.resolve("pyodide")));
    const pyodideFiles = readdirSync(pyodideDir);
    const copySrc = pyodideFiles.map(file => join(pyodideDir, file))
        .concat(PYODIDE_PACKAGES.map(pkg => join(__dirname, 'pyodide', pkg)));
        // .concat(PYODIDE_EXCLUDE);
    return viteStaticCopy({
        targets: [
            {
                src: copySrc,
                dest: "pyodide",
            },
        ],
    }) as any;
}

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
        permissions: ['storage'],
        browser_specific_settings: {
            gecko: {
                id: 'uploader@bakatrouble.me',
            },
        },
    },
    zip: {
        excludeSources: [
            'web-ext-artifacts/**/*',
        ],
    },
    vite: (): WxtViteConfig => ({
        optimizeDeps: {
            exclude: ['pyodide'],
        },
        plugins: [
            viteStaticCopyPyodide(),
        ],
        build: {
            sourcemap: true,
            minify: false,
            cssMinify: false,
        }
    }),
});
