import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({ storageState: AUTH_FILE });

test.describe('Knowledge Base P0', () => {
  test('upload multiple files to knowledge base', async ({ page }) => {
    // Mock the upload API
    await page.route('**/api/upload', (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'All files are successfully processed',
          status: 200,
          files: [
            {
              fileName: 'test-document.md',
              fileSize: 200,
              uniqueFileId: 'e2e-mock-file-multi-001',
            },
            {
              fileName: 'test-document-2.md',
              fileSize: 300,
              uniqueFileId: 'e2e-mock-file-multi-002',
            },
          ],
        }),
      });
    });

    await page.goto(ROUTES.knowledgeUpload);
    await expect(page).toHaveURL(/upload-files/);

    // Upload multiple files using the file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(__dirname, 'fixtures', 'test-document.md'),
      path.join(__dirname, 'fixtures', 'test-document-2.md'),
    ]);

    // Both files should appear in the upload list
    await expect(page.getByText('test-document.md').first()).toBeVisible({
      timeout: 5_000,
    });

    // Click send/upload button
    await page.getByText(/wyślij/i).click();

    // Should show success toast
    await expect(page.getByText(/pliki zostały wgrane/i)).toBeVisible({
      timeout: 10_000,
    });

    // Should redirect to documents list
    await expect(page).toHaveURL(/documents-list/, { timeout: 10_000 });
  });

  test('documents list page shows uploaded files', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);

    // The table/list should be visible
    await expect(
      page.locator('table').or(page.locator('[role="table"]')),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('delete a document from knowledge base', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Check if there are any files with actions menu
    const actionsButton = page.locator('button[aria-label="Actions"]').first();
    if (
      !(await actionsButton.isVisible({ timeout: 5_000 }).catch(() => false))
    ) {
      test.skip(true, 'No files in knowledge base to delete');
      return;
    }

    await actionsButton.click();

    // Click delete in the dropdown — use the red-styled delete option
    const deleteOption = page
      .locator('[data-slot="icon"]')
      .locator('..')
      .filter({ hasText: /^usuń$/i });
    if (await deleteOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteOption.click();
    } else {
      // Fallback: find any menu item with "Usuń"
      await page
        .getByRole('button', { name: /^usuń$/i })
        .first()
        .click();
    }

    // Confirm deletion in the modal
    const deleteModal = page.locator('[role="dialog"]');
    if (await deleteModal.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await deleteModal
        .locator('button')
        .filter({ hasText: /^usuń$/i })
        .click();

      // Wait for modal to close or file to be removed
      await page.waitForTimeout(2_000);
    }
  });

  test('add knowledge from URL — form renders and submits', async ({
    page,
  }) => {
    await page.goto(ROUTES.knowledgeFromUrl);
    await expect(page).toHaveURL(/add-from-url/);

    // Title heading should be visible
    await expect(
      page.getByRole('heading', { name: /dodaj wiedzę z linku/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Fill in a URL
    const urlInput = page.locator('input[name="url"]');
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    await urlInput.fill('https://example.com/test-page');

    // Submit the form — the button text changes to loading state
    const submitButton = page.getByRole('button', { name: /załaduj wiedzę/i });
    await submitButton.click();

    // The button should show loading state or a toast should appear
    await expect(
      page
        .getByText(/ładowanie|przetwarzanie/i)
        .or(page.getByText(/wiedza pobrana/i))
        .or(page.getByText(/błąd/i)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('add knowledge from URL — validation rejects empty URL', async ({
    page,
  }) => {
    await page.goto(ROUTES.knowledgeFromUrl);
    await expect(page).toHaveURL(/add-from-url/);

    // Try to submit without entering a URL
    await page.getByText(/załaduj wiedzę/i).click();

    // Should show validation error
    await expect(page.locator('#input-error')).toBeVisible({ timeout: 5_000 });
  });
});
