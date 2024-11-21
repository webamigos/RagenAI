import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
});

test('sign in success', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign in' }).click();

  const testEmail = process.env.TESTS_CLERK_USER_EMAIL!;
  const testPassword = process.env.TESTS_CLERK_USER_PASSWORD!;

  await page.locator('#email').fill(testEmail);
  await page.locator('#password').fill(testPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(2000);

  await page.waitForURL('/en');

  await expect(page.getByText(testEmail)).toBeVisible();
});
