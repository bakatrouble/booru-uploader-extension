// Real-conditions coupling test: both built extensions installed as
// temporary add-ons in Playwright Firefox, driven against a fake gallery
// + fake channel-helper API on 127.0.0.1:18474.
//
// - upload buttons render iff the uploader has destinations configured;
// - clicking upload on a not-yet-loaded image shows the waiting notice
//   immediately (before the 5s-delayed full image arrives);
// - the waiting notice clears and "Picture sent" follows once loaded;
// - the wire carries apiKey (never endpoint), raw bytes reach POST
//   /upload as octet-stream, gif URLs reach POST /upload-url as JSON,
//   all under the x-key header.

import type { BrowserContext } from '@playwright/test';
import {
    expect,
    extensionOrigin,
    rdpEvalInExtension,
    rdpNavigate,
    test,
} from './fixtures.js';

const E2E_PORT = Number(process.env.E2E_PORT ?? 18474);
const API_ROOT = `http://127.0.0.1:${E2E_PORT}`;
const SHORT_NAME = 'FFX';

const api = (path: string, init?: RequestInit) =>
    fetch(`${API_ROOT}${path}`, init);

interface ApiLogEntry {
    method: string;
    path: string;
    xKey?: string;
    contentType?: string;
    bytes?: number;
    json?: { url?: string };
}

const apiLog = async () =>
    (await api('/__log')).json() as unknown as ApiLogEntry[];

async function seedDestinations(pcontext: BrowserContext) {
    const uploaderOrigin = await extensionOrigin(
        pcontext,
        'uploader@bakatrouble.me',
    );
    const optionsUrl = `${uploaderOrigin}/options.html`;
    await rdpNavigate(pcontext, optionsUrl);

    // Seed storage directly via the options page context (same storage
    // the background reads; the updateContextMenu message refreshes it).
    // The eval is fire-and-forget (async IIFE returns a pending promise),
    // so poll a sync flag the script sets on completion.
    await rdpEvalInExtension(
        'options.html',
        'uploader@bakatrouble.me',
        `(async () => { try { await browser.storage.sync.set({ apiRoot: ${JSON.stringify(API_ROOT)}, uploadLinks: [{ id: 'e2e-1', name: 'E2E destination', shortName: ${JSON.stringify(SHORT_NAME)}, apiKey: 'test-key', hotkey: [] }] }); await browser.runtime.sendMessage({ type: 'updateContextMenu' }); window.__e2eSeed = 'done'; } catch (e) { window.__e2eSeed = 'error:' + String(e && e.message || e); } })(); 'seed-started'`,
    );
    for (let i = 0; i < 40; i++) {
        const status = await rdpEvalInExtension(
            'options.html',
            'uploader@bakatrouble.me',
            'window.__e2eSeed ?? null',
        );
        if (typeof status === 'string' && status !== 'pending') {
            if (status !== 'done') throw new Error(`seeding failed: ${status}`);
            return;
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('seeding timed out waiting for storage write');
}

async function clearDestinations(pcontext: BrowserContext) {
    const uploaderOrigin = await extensionOrigin(
        pcontext,
        'uploader@bakatrouble.me',
    );
    await rdpNavigate(pcontext, `${uploaderOrigin}/options.html`);
    await rdpEvalInExtension(
        'options.html',
        'uploader@bakatrouble.me',
        `(async () => { await browser.storage.sync.clear(); await browser.runtime.sendMessage({ type: 'updateContextMenu' }); window.__e2eClear = 'done'; })(); 'clear-started'`,
    );
    for (let i = 0; i < 40; i++) {
        const status = await rdpEvalInExtension(
            'options.html',
            'uploader@bakatrouble.me',
            'window.__e2eClear ?? null',
        );
        if (typeof status === 'string' && status === 'done') return;
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('clearing timed out');
}

test.beforeAll(async () => {
    await api('/__reset', { method: 'POST' });
});

test('no upload buttons before destinations are configured', async ({
    wpage: page,
    pcontext,
}) => {
    await clearDestinations(pcontext);
    await page.goto('/');
    await page.locator('.thumb').first().click();
    const lightbox = page.locator('booru-lightbox-ui .lightbox');
    await expect(lightbox).toHaveAttribute('data-visible', 'true');
    await page.waitForTimeout(2000);
    await expect(
        page.locator('booru-lightbox-ui').getByRole('button', {
            name: SHORT_NAME,
        }),
    ).toHaveCount(0);
});

test('seeding destinations via the real options page makes upload buttons appear', async ({
    wpage: page,
    pcontext,
}) => {
    await seedDestinations(pcontext);

    await page.goto('/');
    await page.locator('.thumb').first().click();
    const lightbox = page.locator('booru-lightbox-ui .lightbox');
    await expect(lightbox).toHaveAttribute('data-visible', 'true');
    await expect(
        page.locator('booru-lightbox-ui').getByRole('button', {
            name: SHORT_NAME,
        }),
    ).toBeVisible({ timeout: 10000 });
});

test('waiting notice is immediate on a slow image, then the upload completes', async ({
    wpage: page,
    pcontext,
}) => {
    await seedDestinations(pcontext);
    await api('/__reset', { method: 'POST' });
    await page.goto('/');
    await page.locator('.thumb').nth(1).click();
    const lightbox = page.locator('booru-lightbox-ui .lightbox');
    await expect(lightbox).toHaveAttribute('data-visible', 'true');

    const clickedAt = Date.now();
    const uploadButton = page
        .locator('booru-lightbox-ui')
        .getByRole('button', { name: SHORT_NAME });
    // Buttons render once the preview loads (fast); the full image is
    // still delayed server-side, so the waiting notice must beat it.
    await expect(uploadButton).toBeVisible({ timeout: 10000 });
    await uploadButton.click();
    const waiting = page
        .locator('booru-notifications-ui')
        .getByText('Waiting for the full image to load');
    // The full image is delayed 5s server-side: feedback must land first.
    await expect(waiting).toBeVisible({ timeout: 4000 });
    expect(Date.now() - clickedAt).toBeLessThan(4500);

    await expect(
        page.locator('booru-notifications-ui').getByText('Picture sent'),
    ).toBeVisible({ timeout: 30000 });
    await expect(waiting).toBeHidden({ timeout: 10000 });

    const log = await apiLog();
    expect(log.filter((e) => e.path === '/hashes').length).toBeGreaterThan(0);
    const uploads = log.filter((e) => e.path === '/upload');
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.xKey).toBe('test-key');
    expect(uploads[0]!.contentType).toMatch(
        /^(application\/octet-stream|image\/jpeg)/,
    );
    expect(uploads[0]!.bytes).toBeGreaterThan(0);
    expect(log.some((e) => e.path === '/photo')).toBe(false);
    expect(log.some((e) => e.path === '/gif')).toBe(false);
});

test('gif uploads go to /upload-url with the destination key', async ({
    wpage: page,
    pcontext,
}) => {
    await seedDestinations(pcontext);
    await api('/__reset', { method: 'POST' });
    await page.goto('/');
    await page.locator('.thumb').nth(2).click();
    const lightbox = page.locator('booru-lightbox-ui .lightbox');
    await expect(lightbox).toHaveAttribute('data-visible', 'true');

    const gifUploadButton = page
        .locator('booru-lightbox-ui')
        .getByRole('button', { name: SHORT_NAME });
    await expect(gifUploadButton).toBeVisible({ timeout: 10000 });
    await gifUploadButton.click();
    await expect(
        page.locator('booru-notifications-ui').getByText('GIF sent'),
    ).toBeVisible({ timeout: 30000 });

    const log = await apiLog();
    const urlUploads = log.filter((e) => e.path === '/upload-url');
    expect(urlUploads).toHaveLength(1);
    expect(urlUploads[0]!.xKey).toBe('test-key');
    expect(urlUploads[0]!.json).toMatchObject({
        url: expect.stringMatching(/\/anim\.gif$/),
    });
});
