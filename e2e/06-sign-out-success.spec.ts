import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';

import { login } from './commands/login';

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
});

test('sign out success', async ({ page }) => {
  await login(page);

  await page.getByLabel('Dropdown menu').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await page.waitForTimeout(2000);

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
