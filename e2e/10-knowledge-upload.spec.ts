import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

import { ROUTES, LABELS } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('upload a file to knowledge base', async ({ page }) => {
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

  await page.goto(ROUTES.knowledgeUpload);

  // Set file on the hidden file input
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(
    path.join(__dirname, 'fixtures', 'test-document.md'),
  );

  // Verify file name appears in the upload list
  await expect(page.getByText('test-document.md')).toBeVisible();

  // Click send/upload button
  await page.getByRole('button', { name: LABELS.send }).click();

  // Assert success toast appears
  await expect(page.getByText(LABELS.uploadSuccess)).toBeVisible({
    timeout: 10_000,
  });

  // Assert URL changed to documents list
  await expect(page).toHaveURL(/knowledge\/documents-list/, {
    timeout: 10_000,
  });
});
