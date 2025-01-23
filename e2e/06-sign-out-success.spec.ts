import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';

import { login } from './commands/login';

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
});

test('sign out success', async ({ page }) => {
  await login(page);

  await page.waitForTimeout(2000);

  await page.locator('[id="headlessui-popover-button-\\:r17\\:"]').click();

  await page.getByText('Sign out').click();

  await page.waitForTimeout(1000);

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
