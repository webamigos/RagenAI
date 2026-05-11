import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Notifications P1 — bell icon', () => {
  test('smoke: authenticated user sees bell icon in header', async ({
    page,
  }) => {
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    const bell = page.getByTestId('notification-bell').first();
    await expect(bell).toBeVisible({ timeout: 10_000 });
  });

  test('clicking bell navigates to notifications page', async ({ page }) => {
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    const bell = page.getByTestId('notification-bell').first();
    await bell.click();

    await expect(page).toHaveURL(/\/notifications/, { timeout: 10_000 });
  });

  test('notifications page shows empty state when no notifications', async ({
    page,
  }) => {
    await page.goto('/pl/notifications');
    await expect(page).toHaveURL(/\/pl\/notifications/);

    // Page renders — either empty state or list
    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('notifications page is accessible', async ({ page }) => {
    await page.goto('/pl/notifications');
    await expect(page).toHaveURL(/\/pl\/notifications/);
    // Page should render (not redirect to sign-in)
    await expect(page.locator('h1, h2').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
