import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({ storageState: AUTH_FILE });

test.describe('Knowledge Base P0', () => {
  test('upload multiple files via dropdown', async ({ page }) => {
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

    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);

    // Open "Dodaj dokument" dropdown
    const addDocButton = page.getByRole('button', {
      name: /dodaj dokument/i,
    });
    await expect(addDocButton).toBeVisible({ timeout: 10_000 });
    await addDocButton.click();

    // Wait for dropdown menu
    await expect(page.getByRole('menuitem', { name: /z dysku/i })).toBeVisible({
      timeout: 5_000,
    });

    // Upload files via the hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(__dirname, 'fixtures', 'test-document.md'),
      path.join(__dirname, 'fixtures', 'test-document-2.md'),
    ]);

    // Should show success toast (Polish: "Przesłano 2 plik(ów)")
    await expect(page.getByText(/plik\(ów\)|file\(s\) uploaded/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('documents list page shows files and folders sidebar', async ({
    page,
  }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);

    // Sidebar navigation should be visible
    await expect(
      page.getByText(/wszystkie pliki|all files/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/moje pliki|my files/i).first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByText(/udostępnione dla mnie|shared with me/i).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Breadcrumbs should show current location
    await expect(
      page.getByRole('navigation', {
        name: /nawigacja folderów|folder navigation/i,
      }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('create folder via button', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);

    // Click "Nowy folder" button
    const newFolderButton = page.getByRole('button', {
      name: /nowy folder|new folder/i,
    });
    await expect(newFolderButton).toBeVisible({ timeout: 10_000 });
    await newFolderButton.click();

    // Create folder dialog should open — wait for the inner panel to be visible
    const dialogPanel = page
      .locator(
        '[role="dialog"] [data-slot="panel"], [role="dialog"] form, [role="dialog"] input[type="text"]',
      )
      .first();
    await expect(dialogPanel).toBeVisible({ timeout: 5_000 });

    // Fill in folder name
    const nameInput = page
      .locator('[role="dialog"] input[type="text"]')
      .first();
    await nameInput.fill('E2E Test Folder');

    // Submit
    await page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /create|stwórz|folder/i })
      .click();

    // Dialog should close — input should disappear
    await expect(nameInput).not.toBeVisible({ timeout: 5_000 });
  });

  test('navigate to folder by clicking folder row', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);
    await page.waitForLoadState('domcontentloaded');

    // Look for a folder row in the table
    const folderRow = page
      .locator('table tr')
      .filter({ hasText: /file/i })
      .first();
    if (!(await folderRow.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No folders in knowledge base to navigate');
      return;
    }

    await folderRow.click();

    // Breadcrumbs should update to show we're inside a folder
    await page.waitForTimeout(1_000);
    const breadcrumb = page.getByRole('navigation', {
      name: /nawigacja folderów|folder navigation/i,
    });
    // Home button + at least 1 clickable segment button means navigation occurred
    await expect
      .poll(() => breadcrumb.locator('button').count(), { timeout: 5_000 })
      .toBeGreaterThan(1);
  });

  test('switch between sidebar views', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);

    // Click "Moje pliki" in sidebar
    await page
      .getByText(/moje pliki|my files/i)
      .first()
      .click();
    await page.waitForTimeout(500);

    // Sidebar should highlight "My Files"
    await expect(
      page.locator('button[aria-current="page"]', {
        hasText: /moje pliki|my files/i,
      }),
    ).toBeVisible({ timeout: 5_000 });

    // Click "Udostępnione dla mnie"
    await page
      .getByText(/udostępnione dla mnie|shared with me/i)
      .first()
      .click();
    await page.waitForTimeout(500);

    // Sidebar should highlight "Shared with me"
    await expect(
      page.locator('button[aria-current="page"]', {
        hasText: /udostępnione dla mnie|shared with me/i,
      }),
    ).toBeVisible({ timeout: 5_000 });

    // Switch back to "Wszystkie pliki"
    await page
      .getByText(/wszystkie pliki|all files/i)
      .first()
      .click();
    await page.waitForTimeout(500);
  });

  test('delete a document from knowledge base', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);
    await page.waitForLoadState('domcontentloaded');

    // Check if there are any files with actions menu
    const actionsButton = page.locator('button[aria-label="Actions"]').first();
    if (
      !(await actionsButton.isVisible({ timeout: 5_000 }).catch(() => false))
    ) {
      test.skip(true, 'No files in knowledge base to delete');
      return;
    }

    await actionsButton.click();

    // Click delete in the dropdown
    const deleteOption = page
      .getByRole('menuitem')
      .filter({ hasText: /^usuń$/i });
    if (await deleteOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteOption.click();
    } else {
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

      await page.waitForTimeout(2_000);
    }
  });

  test('add from URL via dropdown dialog', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);

    // Open "Dodaj dokument" dropdown
    const addDocButton = page.getByRole('button', {
      name: /dodaj dokument/i,
    });
    await expect(addDocButton).toBeVisible({ timeout: 10_000 });
    await addDocButton.click();

    // Click "Dodaj z linku"
    const addFromUrlOption = page.getByRole('menuitem', {
      name: /dodaj z linku|add from url/i,
    });
    await expect(addFromUrlOption).toBeVisible({ timeout: 5_000 });
    await addFromUrlOption.click();

    // Dialog should appear — wait for the input inside it
    const urlInput = page.locator('[role="dialog"] input[type="text"]');
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    await urlInput.fill('https://example.com/test');

    // Submit button should be present
    await expect(
      page
        .locator('[role="dialog"]')
        .getByRole('button', { name: /załaduj|process/i }),
    ).toBeVisible();
  });

  test('create document redirect via dropdown', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);

    // Open dropdown
    const addDocButton = page.getByRole('button', {
      name: /dodaj dokument/i,
    });
    await expect(addDocButton).toBeVisible({ timeout: 10_000 });
    await addDocButton.click();

    // Click "Stwórz dokument"
    const createDocOption = page.getByRole('menuitem', {
      name: /stwórz dokument|create document/i,
    });
    await expect(createDocOption).toBeVisible({ timeout: 5_000 });
    await createDocOption.click();

    // Should navigate to create document page
    await expect(page).toHaveURL(/create-document/, { timeout: 10_000 });
  });
});
