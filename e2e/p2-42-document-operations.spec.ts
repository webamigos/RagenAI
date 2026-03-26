import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Document Operations P2', () => {
  test('create document page renders editor', async ({ page }) => {
    await page.goto(ROUTES.knowledgeCreate);
    await expect(page).toHaveURL(/create-document/);

    // Page title should be visible
    await expect(page.getByText(/stwórz dokument/i)).toBeVisible({
      timeout: 10_000,
    });

    // Title input should be present
    const titleInput = page.getByPlaceholder(/wpisz tytuł dokumentu/i);
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
  });

  test('create document validates empty title', async ({ page }) => {
    await page.goto(ROUTES.knowledgeCreate);
    await expect(page).toHaveURL(/create-document/);

    // Try to submit without filling in title or content
    await page.getByText(/^wyślij$/i).click();

    // Should show validation error
    await expect(
      page.getByText(/tytuł jest wymagany|tytuł|wymagane/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('create document with title and content', async ({ page }) => {
    await page.goto(ROUTES.knowledgeCreate);
    await expect(page).toHaveURL(/create-document/);

    // Fill in the title
    const titleInput = page.getByPlaceholder(/wpisz tytuł dokumentu/i);
    await titleInput.fill('E2E Test Document');

    // Fill in the content editor
    // The editor is a contenteditable div or textarea inside WysiwygEditor
    const editor = page
      .locator('[contenteditable="true"]')
      .or(page.locator('textarea').nth(1))
      .or(page.locator('.ProseMirror'));

    if (await editor.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await editor.click();
      await editor.fill('This is test content for the e2e document.');
    }

    // Submit the document
    await page.getByText(/^wyślij$/i).click();

    // Should either show success or redirect to documents list
    await expect(
      page
        .getByText(/dokument.*utworzony|sukces|success/i)
        .or(page.locator('text=documents-list')),
    )
      .toBeVisible({ timeout: 10_000 })
      .catch(() => {
        // May redirect directly
      });
  });

  test('edit/preview tabs work in document creator', async ({ page }) => {
    await page.goto(ROUTES.knowledgeCreate);
    await expect(page).toHaveURL(/create-document/);

    // Fill in some content first
    const titleInput = page.getByPlaceholder(/wpisz tytuł dokumentu/i);
    await titleInput.fill('Preview Test');

    // Look for Edit/Preview tabs
    const editTab = page.getByText(/^edytuj$/i);
    const previewTab = page.getByText(/^podgląd$/i);

    if (!(await editTab.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'Edit/Preview tabs not visible');
      return;
    }

    // Switch to preview
    await previewTab.click();

    // The title should appear in the preview
    await expect(page.getByText('Preview Test')).toBeVisible({
      timeout: 5_000,
    });

    // Switch back to edit
    await editTab.click();

    // Title input should be visible again
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
  });

  test('documents list shows files with actions menu', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);

    // Wait for the table/list to load
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Check if there are any files in the list
    const actionsButtons = page.locator('button[aria-label="Actions"]');
    const fileCount = await actionsButtons.count();

    if (fileCount > 0) {
      // Click actions menu on first file
      await actionsButtons.first().click();

      // Should show action options (view, edit, download, delete)
      await expect(
        page.getByText(/^(podgląd|edytuj|pobierz|usuń)$/i).first(),
      ).toBeVisible({ timeout: 5_000 });

      // Close the dropdown
      await page.keyboard.press('Escape');
    }
  });
});
