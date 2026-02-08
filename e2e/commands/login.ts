import { type Page } from '@playwright/test';

export const login = async (page: Page) => {
  const testEmail = process.env.TEST_USER_EMAIL!;
  const testPassword = process.env.TEST_USER_PASSWORD!;

  // Navigate to sign-in page
  await page.goto('/en/sign-in');

  // Fill in email and password
  await page.locator('input[type="email"]').fill(testEmail);
  await page.locator('input[type="password"]').fill(testPassword);

  // Click sign in button
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to home page
  await page.waitForURL('/en', { timeout: 10000 });
};
