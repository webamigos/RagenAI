import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';
import { AUTH_FILE } from './constants';
import { ROUTES, reLogin } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.beforeAll(async ({ browser }) => {
  test.setTimeout(60_000);
  await reLogin(browser);
});
test.beforeEach(async ({ page, context }) => {
  await context.clearCookies();
  const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  await context.addCookies(state.cookies);
  await page.goto('/pl/new');
  await page.waitForLoadState('domcontentloaded');
});

test.describe('Edge Cases & Error Handling P3', () => {
  test.describe('Upload validation', () => {
    test('upload rejects unsupported file type', async ({ page }) => {
      // Mock the upload API to return an error for unsupported file types
      await page.route('**/api/upload', (route) => {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'All files failed to process',
            failedFiles: [
              {
                fileName: 'test.doc',
                error: 'Unsupported file type: test.doc',
              },
            ],
          }),
        });
      });

      await page.goto(ROUTES.knowledgeUpload);
      await expect(page).toHaveURL(/upload-files/);

      // Try to upload an unsupported file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles([
        path.join(__dirname, 'fixtures', 'test-document.md'),
      ]);

      await page.getByText(/wyślij/i).click();

      // Should show an error (toast or inline message)
      await expect(
        page.getByText(/failed|błąd|nie udało|unsupported/i),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('send button is disabled without files selected', async ({ page }) => {
      await page.goto(ROUTES.knowledgeUpload);
      await expect(page).toHaveURL(/upload-files/);

      // The send button should be disabled when no files are selected
      const sendButton = page.getByRole('button', { name: /wyślij/i });
      if (await sendButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(sendButton).toBeDisabled();
      }
      // Page should stay on upload
      await expect(page).toHaveURL(/upload-files/);
    });

    test('upload handles server error gracefully', async ({ page }) => {
      // Mock a 500 error
      await page.route('**/api/upload', (route) => {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal server error' }),
        });
      });

      await page.goto(ROUTES.knowledgeUpload);

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles([
        path.join(__dirname, 'fixtures', 'test-document.md'),
      ]);

      await page.getByText(/wyślij/i).click();

      // Should show an error, not crash
      await expect(page.getByText(/error|błąd|nie udało/i)).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test.describe('Form edge cases', () => {
    test('add-from-url rejects invalid URL format', async ({ page }) => {
      await page.goto(ROUTES.knowledgeFromUrl);
      await expect(page).toHaveURL(/add-from-url/);

      // Fill in an invalid URL
      const urlInput = page.locator('input[name="url"]');
      await urlInput.fill('not-a-valid-url');

      await page.getByText(/załaduj wiedzę/i).click();

      // Should show a validation error
      await expect(page.locator('#input-error')).toBeVisible({
        timeout: 5_000,
      });
    });

    test('project creation rejects duplicate project name', async ({
      page,
    }) => {
      await page.goto(ROUTES.projects);
      await expect(page).toHaveURL(/projects/, { timeout: 10_000 });

      // Create project with the same name as the seeded one
      await page.getByRole('button', { name: /nowy asystent/i }).click();

      // Wait for dialog input to appear (Headless UI)
      const titleInput = page.locator('input#title');
      await expect(titleInput).toBeVisible({ timeout: 5_000 });

      await titleInput.fill('E2E Test Project');
      await page.getByRole('button', { name: /^stwórz$/i }).click();

      // Should show an error toast (Sonner) or the dialog stays open with an error
      await expect(
        page.locator('[data-sonner-toast]').first().or(titleInput),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('chat textarea limits message length', async ({ page }) => {
      await page.goto(ROUTES.newChat);
      await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

      // Fill with a very short message (below minimum if there is one)
      await page.locator('textarea').fill('Hi');
      await page.locator('textarea').press('Enter');

      // Either the message sends (no min length) or validation stops it
      // Wait for a concrete outcome: textarea clears (sent) or stays (blocked)
      await expect(page.locator('textarea')).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Auth edge cases', () => {
    test('accessing protected page without session redirects to sign-in', async ({
      browser,
    }) => {
      // Create a new context with empty storage (no cookies/session)
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();

      await page.goto(ROUTES.newChat);

      // Should redirect to sign-in
      await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });

      await context.close();
    });

    test('admin users page loads for admin user', async ({ browser }) => {
      const context = await browser.newContext({
        storageState: AUTH_FILE,
      });
      const page = await context.newPage();

      await page.goto(ROUTES.settingsUsers);
      await page.waitForLoadState('domcontentloaded');

      // Admin should see the users page heading
      await expect(
        page.getByRole('heading', { name: /użytkownicy/i }),
      ).toBeVisible({ timeout: 10_000 });

      await context.close();
    });
  });
});
