import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/en');
});

test('sign in validation', async ({ page }) => {
  await page.getByTestId('sign-in-button').click();

  await page.waitForURL('**/sign-in');

  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText(/email is invalid/i)).toBeVisible();
  await expect(
    page.getByText(/password should have at least 8 characters/i)
  ).toBeVisible();
});
