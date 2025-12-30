import { test, expect } from '@playwright/test';

import { login } from './commands/login';

test.beforeEach(async ({ page }) => {
  await page.goto('/en');
});

test('sign in success', async ({ page }) => {
  await login(page);

  await expect(page.getByText(/new thread/i)).toBeVisible();
});
