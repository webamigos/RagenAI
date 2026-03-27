import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';

test.use({ storageState: AUTH_FILE });

/**
 * i18n tests verify key pages render correctly in both locales.
 * Tests run against Polish (/pl/) and English (/en/) routes.
 */
test.describe('i18n P3', () => {
  test.describe('Polish locale', () => {
    test('new chat page renders in Polish', async ({ page }) => {
      await page.goto('/pl/new');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
      // Polish UI text should be present somewhere on the page
      await expect(page.locator('body')).toContainText(/nowy|czat|asystent/i);
    });

    test('projects page renders in Polish', async ({ page }) => {
      await page.goto('/pl/projects');
      await expect(
        page.getByRole('heading', { name: /asystenci/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('settings page renders in Polish', async ({ page }) => {
      await page.goto('/pl/settings/general');
      await expect(
        page.getByText(/wybierz jak aplikacja wygląda/i),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('knowledge upload page renders in Polish', async ({ page }) => {
      await page.goto('/pl/knowledge/upload-files');
      await expect(page.locator('input[type="file"]')).toBeAttached({
        timeout: 10_000,
      });
    });
  });

  test.describe('English locale', () => {
    test('new chat page renders in English', async ({ page }) => {
      await page.goto('/en/new');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
    });

    test('projects page renders in English', async ({ page }) => {
      await page.goto('/en/projects');
      await expect(
        page.getByRole('heading', { name: /assistants/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('settings page renders in English', async ({ page }) => {
      await page.goto('/en/settings/general');
      // Wait for page content to load and verify English text
      await expect(
        page.getByText(/choose how the application looks/i),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('knowledge upload page renders in English', async ({ page }) => {
      await page.goto('/en/knowledge/upload-files');
      await expect(page.locator('input[type="file"]')).toBeAttached({
        timeout: 10_000,
      });
    });

    test('sign-in page renders in English', async ({ browser }) => {
      // Use fresh context with empty storage to avoid auto-redirect
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();

      await page.goto('/en/sign-in');
      await expect(page).toHaveURL(/en\/sign-in/);
      await expect(page.getByTestId('sign-in-submit')).toBeVisible({
        timeout: 10_000,
      });

      await context.close();
    });
  });

  test.describe('Locale switching', () => {
    test('navigating from /pl/ to /en/ changes UI text', async ({ page }) => {
      // Start on Polish projects page
      await page.goto('/pl/projects');
      await expect(
        page.getByRole('heading', { name: /asystenci/i }),
      ).toBeVisible({ timeout: 10_000 });

      // Navigate to English version
      await page.goto('/en/projects');
      await expect(
        page.getByRole('heading', { name: /assistants/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('navigating from /en/ to /pl/ changes UI text', async ({ page }) => {
      await page.goto('/en/projects');
      await expect(
        page.getByRole('heading', { name: /assistants/i }),
      ).toBeVisible({ timeout: 10_000 });

      await page.goto('/pl/projects');
      await expect(
        page.getByRole('heading', { name: /asystenci/i }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
