import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';

import { login } from './commands/login';

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
});

test('change-assistant-model', async ({ page }) => {
  await login(page);

  // TODO: make full navigation -> settings -> assistant management
  await page.goto('/en/my-profile/prompt-management');
  await page.waitForTimeout(2000);

  await page
    .getByLabel(/expand card/i)
    .first()
    .click();
  await page.waitForTimeout(500);

  await page.locator('#model').selectOption('gpt-4-32k');
  await page.waitForTimeout(2000);

  // temporary fix
  const value = await page.locator('#model').inputValue();
  await expect(value).toBe('gpt-4-32k');

  await expect(
    page.getByText(/language model updated successfully/i).last()
  ).toBeVisible();
});
