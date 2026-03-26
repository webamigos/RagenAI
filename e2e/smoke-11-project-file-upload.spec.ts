import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

import { TEST_PROJECT_TITLE } from './constants';
import { ROUTES, LABELS } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('upload a file to a project', async ({ page }) => {
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
            uniqueFileId: 'e2e-mock-file-002',
          },
        ],
      }),
    });
  });

  // Navigate to projects list
  await page.goto(ROUTES.projects);

  // Find and click the E2E Test Project
  await page.getByText(TEST_PROJECT_TITLE).click();

  // Verify project page loads
  await expect(page.getByText(TEST_PROJECT_TITLE)).toBeVisible();

  // Set file on the hidden file input in the project sidebar
  const fileInput = page.locator(
    'input[type="file"][accept=".md,.epub,.srt,.pdf"]',
  );
  await fileInput.setInputFiles(
    path.join(__dirname, 'fixtures', 'test-document.md'),
  );

  // Assert success toast
  await expect(page.getByText(LABELS.projectFileUploaded)).toBeVisible({
    timeout: 10_000,
  });
});
