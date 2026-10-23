import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('a pushed notification renders and auto-dismisses', async ({ page }) => {
    await page.evaluate(() =>
        (window as any).__notify({ level: 'success', message: 'hello-e2e' }),
    );
    const box = page.locator('.notifications-container');
    await expect(box).toContainText('hello-e2e');

    await expect(box).not.toContainText('hello-e2e', { timeout: 10_000 });
});

test('the container stacks above the lightbox viewer (z-index contract)', async ({
    page,
}) => {
    await page.evaluate(() =>
        (window as any).__notify({ level: 'success', message: 'hello-e2e' }),
    );
    const box = page.locator('.notifications-container');
    await expect(box).toContainText('hello-e2e');

    // The lightbox viewer sits at 100000000; notifications must resolve
    // to exactly one above it, not `auto`.
    await expect
        .poll(async () => box.evaluate((el) => getComputedStyle(el).zIndex))
        .toBe('100000001');
});

test('a loading notification persists until resolved', async ({ page }) => {
    const id = await page.evaluate(() =>
        (window as any).__notify({ level: 'loading', message: 'working-e2e' }),
    );
    const box = page.locator('.notifications-container');
    await expect(box).toContainText('working-e2e');

    // Survives past the 5s auto-dismiss window for terminal notifications.
    await page.waitForTimeout(6_000);
    await expect(box).toContainText('working-e2e');

    await page.evaluate(
        (nid: unknown) =>
            (window as any).__updateNotify({
                id: nid,
                level: 'success',
                message: 'done-e2e',
            }),
        id,
    );
    await expect(box).toContainText('done-e2e');
    await expect(box).not.toContainText('done-e2e', { timeout: 10_000 });
});
