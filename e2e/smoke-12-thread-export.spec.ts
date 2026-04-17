import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_THREAD_ID, TEST_THREAD_TITLE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test('export thread as Markdown triggers export API request', async ({
  page,
}) => {
  // Mock the export endpoint so the test doesn't need real DB data
  await page.route(`**/api/threads/${TEST_THREAD_ID}/export*`, (route) => {
    const url = new URL(route.request().url());
    const format = url.searchParams.get('format');
    if (format === 'md') {
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="thread-export.md"`,
        },
        body: '# E2E Test Export\n\nTest content.',
      });
    }
    return route.fulfill({ status: 400, body: 'Bad Request' });
  });

  // Navigate to chats list page
  await page.goto(ROUTES.chats);
  await expect(page.getByRole('heading', { name: /wątki/i })).toBeVisible({
    timeout: 10_000,
  });

  // Find the seeded thread link in the sidebar
  const threadLink = page.locator('a[href*="/chats/"]').filter({
    hasText: TEST_THREAD_TITLE,
  });
  await expect(threadLink).toBeVisible({ timeout: 10_000 });

  // Hover over the thread to reveal the ellipsis button
  await threadLink.hover();

  // Find and click the ellipsis (3-dot) menu button
  const ellipsisButton = threadLink
    .locator('xpath=..')
    .locator('button')
    .filter({ has: page.locator('svg') })
    .first();
  await expect(ellipsisButton).toBeVisible({ timeout: 5_000 });
  await ellipsisButton.click();

  // Wait for the dropdown menu to appear and click "Eksportuj" submenu trigger
  const exportTrigger = page.getByRole('menuitem', { name: /eksportuj/i });
  await expect(exportTrigger).toBeVisible({ timeout: 5_000 });
  await exportTrigger.hover();

  // Wait for the submenu to appear
  const markdownOption = page.getByRole('menuitem', {
    name: /Markdown \(\.md\)/i,
  });
  await expect(markdownOption).toBeVisible({ timeout: 5_000 });

  // Set up request interception before clicking
  const exportRequestPromise = page.waitForRequest(
    (req) => req.url().includes('/export') && req.url().includes('format=md'),
    { timeout: 10_000 },
  );

  // Click "Markdown (.md)"
  await markdownOption.click();

  // Assert the export request was made
  const exportRequest = await exportRequestPromise;
  expect(exportRequest.url()).toMatch(/\/api\/threads\/.+\/export\?format=md/);
});
