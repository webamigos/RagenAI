import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/en');
});

test('home screen validation', async ({ page }) => {
  await page.getByRole('button', { name: 'Start new thread' }).click();
  await page.waitForTimeout(3000);
  await expect(page.getByText('How Can I help you? Hou have')).toBeVisible();

  await page.getByPlaceholder('Enter your question').click();
  await page.getByPlaceholder('Enter your question').fill('somethibg');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Provide at least 10 characters')).toBeVisible();
});
