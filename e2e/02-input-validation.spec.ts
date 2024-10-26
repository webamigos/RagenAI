import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/en');
});

test('home screen validation', async ({ page }) => {
  await page.getByRole('button', { name: 'Start new thread' }).click();
  await page.waitForTimeout(2000);

  await page.getByPlaceholder('Enter your question').click();
  await page.getByPlaceholder('Enter your question').fill('somethibg');
  await page.getByTestId('send-button').click();
  await page.waitForTimeout(2000);
  await expect(page.getByText('Provide at least 10 characters')).toBeVisible();
});
