import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';

import { login } from './commands/login';

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
});

test.skip('sign out success', async ({ page }) => {
  await login(page);

  await page.waitForTimeout(2000);

  // FIXME: Playwrights detects two Popovers which are almost the same instead of random generated id using useId... it's hard to catch this one
  // await page.locator('[data-testid="tw-popover"] > button').click();

  await page.getByText('Sign out').click();

  await page.waitForTimeout(1000);

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
