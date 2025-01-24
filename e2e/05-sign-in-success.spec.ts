import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';

import { login } from './commands/login';

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
});

test('sign in success', async ({ page }) => {
  await login(page);

  const testEmail = process.env.TESTS_CLERK_USER_EMAIL!?.split('@')[0];
  // FIXME: Playwrights detects two Popovers which are almost the same instead of random generated id using useId... it's hard to catch this one
  // await page.locator('[data-testid="tw-popover"] > button').click();

  await expect(page.getByText(/create a new thread/i)).toBeVisible();
});
