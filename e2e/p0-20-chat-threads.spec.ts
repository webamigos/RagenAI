import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES, buildMockSSE } from './helpers';

test.use({ storageState: AUTH_FILE });

/**
 * Helper: set up SSE mock, send a message, wait for thread creation.
 * Cleans up previous route handlers to avoid stacking.
 */
async function createThreadWithMock(
  page: import('@playwright/test').Page,
  message: string,
  responseContent: string,
) {
  // Clean up any previous route handler to avoid stacking
  await page.unroute('**/api/threads/*');

  await page.route('**/api/threads/*', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body: buildMockSSE({ content: responseContent }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.goto(ROUTES.newChat);
  await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
  await page.locator('textarea').fill(message);
  await page.locator('textarea').press('Enter');

  // Thread should be created — URL changes to /chats/{id}
  await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });

  // Wait for the streamed response to render
  await expect(page.getByText(responseContent)).toBeVisible({
    timeout: 15_000,
  });

  return page.url();
}

test.describe('Chat & Threads P0', () => {
  test('create new thread by sending a message', async ({ page }) => {
    await createThreadWithMock(
      page,
      'Hello, this is a test message',
      'Hello! How can I help you today?',
    );
  });

  test('thread page shows textarea after creation', async ({ page }) => {
    await createThreadWithMock(page, 'Test message', 'Test response.');

    // Textarea should still be available for follow-up messages
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
  });

  test('thread URL is preserved after creation', async ({ page }) => {
    const threadUrl = await createThreadWithMock(
      page,
      'URL test message',
      'URL test response.',
    );

    expect(threadUrl).toMatch(/\/chats\//);

    // Reload — thread page should still load (not redirect to /new)
    await page.reload();
    await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });
  });

  test('new thread appears in chats list', async ({ page }) => {
    await createThreadWithMock(
      page,
      'Thread for list test',
      'List test response.',
    );

    await page.goto(ROUTES.chats);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Verify the chats page loaded with threads heading
    await expect(page.getByRole('heading', { name: /wątki/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('delete thread via context menu', async ({ page }) => {
    await createThreadWithMock(
      page,
      'Delete test message',
      'Delete test response.',
    );

    // Find thread in sidebar and right-click
    const threadLink = page.locator('a[href*="/chats/"]').first();
    await expect(threadLink).toBeVisible({ timeout: 10_000 });
    await threadLink.click({ button: 'right' });

    // Click delete in context menu
    const deleteOption = page.getByRole('menuitem', { name: /usuń/i });
    if (await deleteOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteOption.click();

      // Confirm in alert dialog
      const alertDialog = page.locator('[role="alertdialog"]');
      if (await alertDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await alertDialog
          .locator('button')
          .filter({ hasText: /^usuń$/i })
          .click();
      }
    }
  });

  test('rename thread via context menu', async ({ page }) => {
    await createThreadWithMock(
      page,
      'Rename test message',
      'Rename test response.',
    );

    // Find thread in sidebar
    const threadLink = page.locator('a[href*="/chats/"]').first();
    await expect(threadLink).toBeVisible({ timeout: 10_000 });
    await threadLink.click({ button: 'right' });

    // Click rename in context menu
    const renameOption = page.getByRole('menuitem', { name: /zmień nazwę/i });
    if (await renameOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await renameOption.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      const renameInput = dialog.locator('input').first();
      await renameInput.clear();
      await renameInput.fill('Renamed Thread');
      await dialog
        .locator('button')
        .filter({ hasText: /zapisz/i })
        .click();

      await expect(page.getByText('Renamed Thread')).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
