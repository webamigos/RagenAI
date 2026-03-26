import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Auth P0 — session persistence', () => {
  test('session persists after page refresh', async ({ page }) => {
    await page.goto(ROUTES.newChat);
    await expect(page).toHaveURL(/\/pl\/new/);

    // Confirm we are authenticated — textarea visible
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    // Refresh the page
    await page.reload();

    // Should still be on the same page, not redirected to sign-in
    await expect(page).toHaveURL(/\/pl\/new/);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
  });

  test('session persists when navigating between pages', async ({ page }) => {
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    // Navigate to projects
    await page.goto(ROUTES.projects);
    await expect(page).toHaveURL(/projects/);

    // Navigate back to chat
    await page.goto(ROUTES.newChat);
    await expect(page).toHaveURL(/\/pl\/new/);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Auth P0 — sign-up form validation', () => {
  test('sign-up page shows validation errors on empty submit', async ({
    page,
  }) => {
    await page.goto(ROUTES.signUp);
    await expect(page).toHaveURL(/sign-up/);

    // Try to submit empty form — find and click submit button
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Should show validation errors (email and password required)
    await expect(
      page.getByText(/nieprawidłowy adres email|email/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('sign-up page renders all required fields', async ({ page }) => {
    await page.goto(ROUTES.signUp);
    await expect(page).toHaveURL(/sign-up/);

    // Verify form fields are present
    await expect(page.locator('input[type="email"]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('input[type="password"]')).toBeVisible({
      timeout: 5_000,
    });

    // Verify link to sign-in exists
    await expect(page.getByRole('link', { name: /zaloguj/i })).toBeVisible();
  });
});
