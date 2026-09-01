import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({ storageState: AUTH_FILE });

test.describe('PII Policy Upload P2', () => {
  test('upload dialog shows PII policy dropdown with default value', async ({
    page,
  }) => {
    await page.goto(ROUTES.knowledgeUpload);
    await expect(page).toHaveURL(/upload-files/, { timeout: 15_000 });

    // The PII policy label should be visible on the upload page
    // Translation: pii-policy.label = "Polityka maskowania PII"
    await expect(page.getByText(/Polityka maskowania PII/i)).toBeVisible({
      timeout: 10_000,
    });

    // The select element for PII policy should be visible
    const piiSelect = page.locator('#upload-pii-policy');
    await expect(piiSelect).toBeVisible({ timeout: 10_000 });

    // Default value should be TOXIC_ONLY
    // Translation: pii-policy.toxic-only-label = "Tylko toksyczne (zalecane)"
    await expect(piiSelect).toHaveValue('TOXIC_ONLY');
  });

  test('upload with STRICT policy sends pii_policy=STRICT in the request', async ({
    page,
  }) => {
    let capturedPiiPolicy: string | null = null;

    // Intercept upload API and capture pii_policy from FormData
    await page.route('**/api/upload', async (route) => {
      const request = route.request();
      const postData = request.postData() ?? '';
      // FormData body contains the field name followed by its value in multipart format
      // Extract pii_policy value from multipart body
      const match = /name="pii_policy"\r?\n\r?\n([^\r\n-]+)/.exec(postData);
      capturedPiiPolicy = match ? match[1].trim() : null;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'All files are successfully processed',
          status: 200,
          files: [
            {
              fileName: 'test-document.md',
              fileSize: 200,
              uniqueFileId: 'e2e-mock-pii-file-001',
            },
          ],
        }),
      });
    });

    await page.goto(ROUTES.knowledgeUpload);
    await expect(page).toHaveURL(/upload-files/, { timeout: 15_000 });

    // Wait for the PII policy select to be visible
    const piiSelect = page.locator('#upload-pii-policy');
    await expect(piiSelect).toBeVisible({ timeout: 10_000 });

    // Change PII policy to STRICT
    // Translation: pii-policy.strict-label = "Ścisłe — maskuj wszystkie PII"
    await piiSelect.selectOption('STRICT');
    await expect(piiSelect).toHaveValue('STRICT');

    // Upload a test file via the file uploader
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(
      path.join(__dirname, 'fixtures', 'test-document.md'),
    );

    // Click the upload/send button
    // Translation: admin-panel.send
    const sendButton = page
      .getByRole('button', { name: /wyślij|send/i })
      .first();
    await expect(sendButton).toBeEnabled({ timeout: 10_000 });
    await sendButton.click();

    // Wait for the API to be called
    await page.waitForResponse('**/api/upload', { timeout: 10_000 });

    // Assert the intercepted request contained pii_policy=STRICT
    expect(capturedPiiPolicy).toBe('STRICT');
  });

  test('create folder dialog shows PII policy dropdown', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/, { timeout: 15_000 });

    // Click "Nowy folder" button in the sidebar
    // Translation: create-folder button text
    const newFolderButton = page.getByRole('button', {
      name: /nowy folder|new folder/i,
    });
    await expect(newFolderButton).toBeVisible({ timeout: 10_000 });
    await newFolderButton.click();

    // Dialog should open — wait for it to appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // The PII policy select should be present in the dialog
    // CreateFolderDialog uses id="folder-pii-policy"
    const piiSelect = dialog.locator('#folder-pii-policy');
    await expect(piiSelect).toBeVisible({ timeout: 5_000 });

    // Default value should be TOXIC_ONLY
    await expect(piiSelect).toHaveValue('TOXIC_ONLY');

    // Close the dialog via Cancel button
    const cancelButton = dialog.getByRole('button', {
      name: /cancel|anuluj/i,
    });
    await expect(cancelButton).toBeVisible({ timeout: 5_000 });
    await cancelButton.click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });
});
