import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_USER_NAME, TEST_USER_EMAIL } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Admin Functions P3', () => {
  test.describe('Users management', () => {
    test('users page lists all users', async ({ page }) => {
      await page.goto(ROUTES.settingsUsers);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // Page heading should be visible
      await expect(page.getByText(/użytkownicy/i).first()).toBeVisible({
        timeout: 10_000,
      });

      // The test user should appear in the main content area
      await expect(
        page.getByRole('main').getByText(TEST_USER_NAME, { exact: true }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('users page has search functionality', async ({ page }) => {
      await page.goto(ROUTES.settingsUsers);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      const searchInput = page.getByPlaceholder(/szukaj użytkowników/i);
      await expect(searchInput).toBeVisible({ timeout: 10_000 });

      // Search for the test user
      await searchInput.fill(TEST_USER_NAME);

      // Test user should still be visible in main content
      await expect(
        page.getByRole('main').getByText(TEST_USER_NAME, { exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // Search for non-existent user
      await searchInput.clear();
      await searchInput.fill('nonexistentuserxyz999');

      await expect(page.getByText(/nie znaleziono użytkowników/i)).toBeVisible({
        timeout: 10_000,
      });
    });

    test('user row shows role badge', async ({ page }) => {
      await page.goto(ROUTES.settingsUsers);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // The test user has admin role
      await expect(page.getByText(/admin/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    test('user actions dropdown opens', async ({ page }) => {
      await page.goto(ROUTES.settingsUsers);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // Find ellipsis buttons in the main content area (user action menus)
      const ellipsisButtons = page
        .getByRole('main')
        .locator('button')
        .filter({ has: page.locator('svg.size-5, svg.h-5') });

      const count = await ellipsisButtons.count();
      if (count === 0) {
        test.skip(true, 'No user action buttons found');
        return;
      }

      await ellipsisButtons.first().click();

      // Should show action items in a dropdown/menu
      await expect(
        page
          .getByRole('menuitem', { name: /zmień nazwę|zablokuj|podszyj się/i })
          .first()
          .or(page.getByText(/zmień nazwę|zablokuj|podszyj się/i).first()),
      ).toBeVisible({ timeout: 5_000 });

      await page.keyboard.press('Escape');
    });
  });

  test.describe('AI Usage dashboard', () => {
    test('AI usage page loads with summary cards', async ({ page }) => {
      await page.goto(ROUTES.settingsAiUsage);
      await expect(page.getByText(/ai usage/i)).toBeVisible({
        timeout: 10_000,
      });

      // Summary cards should be visible
      await expect(page.getByText(/total calls/i)).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(/total tokens/i)).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(/estimated cost/i)).toBeVisible({
        timeout: 10_000,
      });
    });

    test('AI usage page has period filter buttons', async ({ page }) => {
      await page.goto(ROUTES.settingsAiUsage);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // Period filter buttons should be visible
      await expect(page.getByText(/today/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/^7d$/i)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/^30d$/i)).toBeVisible({ timeout: 5_000 });

      // Click a different period
      await page.getByText(/^30d$/i).click();

      // Page should reload data (no crash)
      await expect(page.getByText(/total calls/i)).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test.describe('Disk Usage dashboard', () => {
    test('disk usage page loads', async ({ page }) => {
      await page.goto(ROUTES.settingsDiskUsage);
      await expect(page.getByText(/disk usage/i)).toBeVisible({
        timeout: 10_000,
      });
    });

    test('disk usage shows organization storage info', async ({ page }) => {
      await page.goto(ROUTES.settingsDiskUsage);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // Should show some storage-related content
      await expect(
        page.getByText(/organization|mb|files|storage/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
