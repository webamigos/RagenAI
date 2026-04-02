import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

import { ROUTES } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('upload a file to knowledge base via inline upload', async ({ page }) => {
  // Mock the upload API to avoid needing S3/Temporal
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
            uniqueFileId: 'e2e-mock-file-001',
          },
        ],
      }),
    });
  });

  await page.goto(ROUTES.knowledgeDocuments);
  await expect(page).toHaveURL(/documents-list/);

  // Click "Dodaj dokument" dropdown button
  const addDocButton = page.getByRole('button', {
    name: /dodaj dokument/i,
  });
  await expect(addDocButton).toBeVisible({ timeout: 10_000 });
  await addDocButton.click();

  // Click "Z dysku" option
  const fromDiskOption = page.getByRole('menuitem', { name: /z dysku/i });
  await expect(fromDiskOption).toBeVisible({ timeout: 5_000 });

  // Set file on the hidden file input (triggered by the menu item click)
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(
    path.join(__dirname, 'fixtures', 'test-document.md'),
  );

  // Assert success toast appears
  await expect(page.getByText(/file\(s\) uploaded/i)).toBeVisible({
    timeout: 10_000,
  });
});
