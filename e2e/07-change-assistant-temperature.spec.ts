import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';
import { nanoid } from 'nanoid';

import { login } from './commands/login';

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
});

test('change-assistant-temperature', async ({ page }) => {
  await login(page);

  await page.locator('.flex > div > .bg-white > a:nth-child(4)').click();

  await page.waitForTimeout(2000);

  // FIXME:
  // await page.getByRole('button', { name: /assistant management/i }).click();

  await page.goto('/en/my-profile/prompt-management');
  await page.waitForTimeout(2000);

  await page.locator('form').getByRole('button').nth(1).click();
  await page.getByLabel(/openai api key/i).fill(nanoid());
  await page.locator('form').getByRole('button').nth(1).click();

  await page.waitForTimeout(2000);
  await expect(page.getByText(/api key saved successfully/i)).toBeVisible();

  await expect(page.getByText(/set environment variables/i)).toBeVisible();

  await page.locator('#temperature').fill('0.3');
  await page.waitForTimeout(2000);

  await expect(page.getByText('0.3')).toBeVisible();
});
