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
  await page.locator('[id="headlessui-popover-button-\\:re\\:"]').click();

  await expect(page.getByText(testEmail)).toBeVisible();
});
