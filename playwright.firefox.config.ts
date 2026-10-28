import { defineConfig } from '@playwright/test';

const E2E_PORT = Number(process.env.E2E_PORT ?? 18474);

export default defineConfig({
    testDir: 'tests/e2e-firefox',
    testMatch: /e2e-firefox\/.*\.spec\.ts/,
    timeout: 120000,
    workers: 1,
    fullyParallel: false,
    reporter: 'list',
    use: {
        baseURL: `http://127.0.0.1:${E2E_PORT}`,
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'node tests/e2e-firefox/server.ts',
        url: `http://127.0.0.1:${E2E_PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
    },
});
