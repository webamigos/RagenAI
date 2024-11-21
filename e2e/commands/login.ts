import { setupClerkTestingToken } from '@clerk/testing/dist/types/playwright';
import { type Page } from '@playwright/test';

export const login = async (page: Page) => {
  const testEmail = process.env.TESTS_CLERK_USER_EMAIL!;
  const testPassword = process.env.TESTS_CLERK_USER_PASSWORD!;

  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.locator('#email').fill(testEmail);
  await page.locator('#password').fill(testPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(2000);

  await page.waitForURL('/en');
};
