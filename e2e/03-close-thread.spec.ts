import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/en');
});

test('open and close thread', async ({ page }) => {
  await page.getByRole('button', { name: 'Start new thread' }).click();
  await page.waitForTimeout(1000);

  await page.getByLabel('Close thread').click();

  await expect(
    page.getByRole('button', { name: 'Start new thread' })
  ).toBeVisible();
});
