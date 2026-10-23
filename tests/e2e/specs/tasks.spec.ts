import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('task cells render with their statuses', async ({ page }) => {
    const cells = page.locator('.task-cell');
    await expect(cells).toHaveCount(3);
    await expect(page.locator('.task-list')).toContainText('queued');
    await expect(page.locator('.task-list')).toContainText('processing');
    await expect(page.locator('.task-list')).toContainText('complete');
});

test('clicking remove forwards removeTask with the task id', async ({
    page,
}) => {
    const firstCell = page.locator('.task-cell').first();
    await firstCell.locator('.remove-btn').click();
    const messages = await page.evaluate(() => (window as any).__portMessages);
    expect(messages).toContainEqual({ type: 'removeTask', id: 't-queued' });
});

test('a processing task has no remove button', async ({ page }) => {
    const cells = page.locator('.task-cell');
    await expect(cells).toHaveCount(3);
    // The harness mounts queued, processing, complete in order.
    await expect(cells.nth(1)).toContainText('processing');
    await expect(cells.nth(1).locator('.remove-btn')).toHaveCount(0);
    await expect(cells.nth(0).locator('.remove-btn')).toHaveCount(1);
    await expect(cells.nth(2).locator('.remove-btn')).toHaveCount(1);
});
