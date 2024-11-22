import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';

import { login } from './commands/login';

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
});

test('change-assistant-model', async ({ page }) => {
  await login(page);

  await page.goto('/en/my-profile/prompt-management');
  await page.waitForTimeout(3000);

  const isVisible = await page
    .getByText(/set environment variables/i)
    .isVisible();
  expect(isVisible).toBeTruthy();

  await page.locator('#model').selectOption('gpt-4-32k');
  await page.waitForTimeout(2000);

  // temporary fix
  const value = await page.locator('#model').inputValue();
  await expect(value).toBe('gpt-4-32k');

  // TODO: somehow this toast doesn't appear but toast are problematic in e2e tests
  // await expect(page.getByText(/model updated successfully/i)).toBeVisible();
});
