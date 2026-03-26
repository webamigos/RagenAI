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
      path.join(__dirname, 'fixtures', 'test-document.md'),
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
    // First upload a file (mocked)
    await page.route('**/api/upload', (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'All files are successfully processed',
          status: 200,
          files: [
            {
              fileName: 'file-to-delete.md',
              fileSize: 150,
              uniqueFileId: 'e2e-mock-file-delete-001',
            },
          ],
        }),
      });
    });

    await page.goto(ROUTES.knowledgeUpload);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(__dirname, 'fixtures', 'test-document.md'),
    ]);
    await page.getByText(/wyślij/i).click();
    await expect(page).toHaveURL(/documents-list/, { timeout: 10_000 });

    // Find the file's action menu (ellipsis button)
    const actionsButton = page.locator('button[aria-label="Actions"]').first();
    await actionsButton.click();

    // Click delete in the dropdown
    await page
      .getByText(/^usuń$/i)
      .first()
      .click();

    // Confirm deletion in the modal
    const deleteModal = page.locator('[role="dialog"]');
    await expect(deleteModal).toBeVisible({ timeout: 5_000 });
    await expect(deleteModal.getByText(/usuń plik/i)).toBeVisible();

    // Click the destructive "Usuń" button in the modal
    await deleteModal
      .locator('button')
      .filter({ hasText: /^usuń$/i })
      .click();

    // Modal should close
    await expect(deleteModal).not.toBeVisible({ timeout: 10_000 });
  });

  test('add knowledge from URL — form submission', async ({ page }) => {
    // Mock the processUrl server action
    await page.route('**/add-from-url', async (route) => {
      await route.fallback();
    });

    await page.goto(ROUTES.knowledgeFromUrl);
    await expect(page).toHaveURL(/add-from-url/);

    // Title should be visible
    await expect(page.getByText(/dodaj wiedzę z linku/i)).toBeVisible({
      timeout: 10_000,
    });

    // Fill in a URL
    const urlInput = page.locator('input[name="url"]');
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    await urlInput.fill('https://example.com/test-page');

    // Submit the form
    await page.getByText(/załaduj wiedzę/i).click();

    // The button should show loading state
    await expect(page.getByText(/ładowanie|przetwarzanie/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('add knowledge from URL — validation rejects empty URL', async ({
    page,
  }) => {
    await page.goto(ROUTES.knowledgeFromUrl);
    await expect(page).toHaveURL(/add-from-url/);

    // Try to submit without entering a URL
    await page.getByText(/załaduj wiedzę/i).click();

    // Should show validation error
    await expect(page.getByText(/url|adres|wymagane|required/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});
