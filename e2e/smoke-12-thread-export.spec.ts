import { test, expect } from '@playwright/test';

import { TEST_THREAD_ID, TEST_THREAD_TITLE } from './constants';
import { ROUTES } from './helpers';

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

  // Set up request interception FIRST (before any UI interaction) to avoid race condition
  const exportRequestPromise = page.waitForRequest(
    (req) => req.url().includes('/export') && req.url().includes('format=md'),
    { timeout: 10_000 },
  );

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

  // Get the parent group container and hover to reveal the ellipsis button
  const threadContainer = page
    .locator('[class*="group"]')
    .filter({ has: page.getByText(TEST_THREAD_TITLE) })
    .first();
  await threadContainer.hover();

  // Find and click the ellipsis (3-dot) menu button
  const ellipsisButton = threadContainer
    .locator('button[type="button"]')
    .last();
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

  // Click "Markdown (.md)" — the waitForRequest promise was registered before all UI interactions
  await markdownOption.click();

  // Assert the export request was made
  const exportRequest = await exportRequestPromise;
  expect(exportRequest.url()).toMatch(/\/api\/threads\/.+\/export\?format=md/);
});
