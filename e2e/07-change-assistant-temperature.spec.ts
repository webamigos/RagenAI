import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
});

test('change-assistant-temperature', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign in' }).click();

  const testEmail = process.env.TESTS_CLERK_USER_EMAIL!;
  const testPassword = process.env.TESTS_CLERK_USER_PASSWORD!;

  await page.locator('#email').click();
  await page.locator('#email').fill(testEmail);
  await page.locator('#password').fill(testPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(2000);

  await page.goto('http://localhost:3000/en/my-profile/prompt-management');
  await page.waitForTimeout(2000);

  const isVisible = await page
    .getByText('Set Environment VariablesOpenAI API')
    .isVisible();
  expect(isVisible).toBeTruthy();

  await page.locator('#temperature').fill('0.3');
  await page.goto('http://localhost:3000/en/my-profile/prompt-management');
  await page.waitForTimeout(500);
  await expect(page.getByText('Set temperature0.3')).toBeVisible();
});
