import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/en');
});

// no longer relevant
test.skip('home elements are visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await expect(
    page.getByRole('button', { name: /start new thread/i })
  ).toBeVisible();
});
