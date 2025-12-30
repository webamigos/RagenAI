import { test, expect } from '@playwright/test';

import { login } from './commands/login';

test.beforeEach(async ({ page }) => {
  await page.goto('/en');
});

test('sign out success', async ({ page }) => {
  await login(page);

  await page.waitForTimeout(2000);

  await page.getByTestId('avatar-icon').last().click();
  await page.waitForTimeout(1000);
  await page.getByText(/sign out/i).click();

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
