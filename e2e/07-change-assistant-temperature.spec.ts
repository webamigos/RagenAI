import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';
import { nanoid } from 'nanoid';

import { login } from './commands/login';

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
});

// FIXME: flaky on CI
test.skip('change-assistant-temperature', async ({ page }) => {
  await login(page);

  // TODO: make full navigation -> settings -> assistant management
  // await page.getByRole('main').getByTestId('home-or-settings-button').click();
  // await page.waitForTimeout(2000);
  // await page.getByRole('link', { name: /assistant settings/i }).click();

  await page.goto('/en/my-profile/prompt-management');

  await page.waitForTimeout(2000);
  await page
    .getByLabel(/expand card/i)
    .first()
    .click();
  await page.waitForTimeout(500);

  await page.locator('#temperature').fill('0.3');
  await page.mouse.down();
  await expect(page.getByText('0.3')).toBeVisible();

  await page.locator('#max-documents').fill('6');
  await page.mouse.down();
  await expect(page.getByText('6')).toBeVisible();
});
