import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('task cells render with their statuses', async ({ page }) => {
    const cells = page.locator('.task-cell');
    await expect(cells).toHaveCount(4);
    await expect(page.locator('.tab')).toContainText('queued');
    await expect(page.locator('.tab')).toContainText('processing');
    await expect(page.locator('.tab')).toContainText('complete');
    await expect(page.locator('.tab')).toContainText('failed');
});

test('clicking remove forwards removeTask with the task id', async ({
    page,
}) => {
    const completeCell = page
        .locator('.task-cell')
        .filter({ hasText: 'complete' });
    await completeCell.locator('.remove-btn').click();
    const messages = await page.evaluate(() => (window as any).__portMessages);
    expect(messages).toContainEqual({ type: 'removeTask', id: 't-complete' });
});

test('a processing task has no remove button', async ({ page }) => {
    const processingCell = page
        .locator('.task-cell')
        .filter({ hasText: 'processing' });
    await expect(processingCell.locator('.remove-btn')).toHaveCount(0);
    await expect(processingCell.locator('.retry-btn')).toHaveCount(0);
});

test('only failed tasks offer retry', async ({ page }) => {
    await expect(page.locator('.retry-btn')).toHaveCount(1);
    const failedCell = page.locator('.task-cell').filter({
        hasText: 'failed',
    });
    await failedCell.locator('.retry-btn').click();
    const messages = await page.evaluate(() => (window as any).__portMessages);
    expect(messages).toContainEqual({ type: 'retryTask', id: 't-failed' });
});

test('failed-only filter narrows the processed list', async ({ page }) => {
    await expect(page.locator('.task-cell')).toHaveCount(4);
    await page.getByRole('button', { name: 'Failed only' }).click();
    const processedList = page.locator('.task-list').nth(1);
    await expect(processedList.locator('.task-cell')).toHaveCount(1);
    await expect(processedList.locator('.task-cell')).toContainText('failed');
});
