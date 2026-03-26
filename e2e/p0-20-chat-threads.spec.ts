import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_PROJECT_PUBLIC_ID } from './constants';
import { ROUTES, buildMockSSE } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Chat & Threads P0', () => {
  test('create new thread by sending a message', async ({ page }) => {
    // Mock the streaming chat API so we don't need a real LLM
    await page.route('**/api/threads/*', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = buildMockSSE({
          content: 'Hello! How can I help you today?',
        });
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          body,
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    // Type a message and submit
    await page.locator('textarea').fill('Hello, this is a test message');
    await page.locator('textarea').press('Enter');

    // Should navigate to a thread page /chats/{threadId}
    await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });

    // The AI response should appear
    await expect(
      page.getByText('Hello! How can I help you today?'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('message history loads when reopening a thread', async ({ page }) => {
    // First, create a thread with a message
    await page.route('**/api/threads/*', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = buildMockSSE({
          content: 'I am the AI assistant response.',
        });
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          body,
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    await page.locator('textarea').fill('First test message');
    await page.locator('textarea').press('Enter');

    // Wait for thread to be created and response received
    await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });
    await expect(page.getByText('I am the AI assistant response.')).toBeVisible(
      { timeout: 15_000 },
    );

    // Capture the thread URL
    const threadUrl = page.url();

    // Navigate away
    await page.goto(ROUTES.projects);
    await expect(page).toHaveURL(/projects/, { timeout: 10_000 });

    // Navigate back to the thread
    await page.goto(threadUrl);

    // Messages should still be visible (loaded from history)
    await expect(page.getByText('First test message')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('switch between threads shows correct messages', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/threads/*', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        callCount++;
        const content =
          callCount === 1
            ? 'Response to thread one.'
            : 'Response to thread two.';
        const body = buildMockSSE({ content });
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          body,
        });
      } else {
        await route.fallback();
      }
    });

    // Create first thread
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
    await page.locator('textarea').fill('Message for thread one');
    await page.locator('textarea').press('Enter');
    await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });
    await expect(page.getByText('Response to thread one.')).toBeVisible({
      timeout: 15_000,
    });

    const thread1Url = page.url();

    // Create second thread
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
    await page.locator('textarea').fill('Message for thread two');
    await page.locator('textarea').press('Enter');
    await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });
    await expect(page.getByText('Response to thread two.')).toBeVisible({
      timeout: 15_000,
    });

    // Switch back to first thread
    await page.goto(thread1Url);
    await expect(page.getByText('Message for thread one')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('thread appears in sidebar after creation', async ({ page }) => {
    await page.route('**/api/threads/*', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = buildMockSSE({ content: 'Sidebar test response.' });
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          body,
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    await page.locator('textarea').fill('Sidebar visibility test');
    await page.locator('textarea').press('Enter');

    await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });
    await expect(page.getByText('Sidebar test response.')).toBeVisible({
      timeout: 15_000,
    });

    // The thread should appear in the sidebar — check for the message preview
    await page.goto(ROUTES.chats);
    await expect(page.getByText(/sidebar visibility test/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('delete thread removes it from sidebar', async ({ page }) => {
    // Create a thread first
    await page.route('**/api/threads/*', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = buildMockSSE({ content: 'Delete me response.' });
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          body,
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    await page.locator('textarea').fill('Thread to be deleted');
    await page.locator('textarea').press('Enter');
    await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });
    await expect(page.getByText('Delete me response.')).toBeVisible({
      timeout: 15_000,
    });

    // Go to chats list and find the thread
    await page.goto(ROUTES.chats);
    const threadItem = page.getByText(/thread to be deleted/i);
    await expect(threadItem).toBeVisible({ timeout: 10_000 });

    // Right-click or open dropdown menu on the thread
    await threadItem.click({ button: 'right' });

    // Click delete option
    const deleteButton = page.getByText(/^usuń$/i);
    if (await deleteButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteButton.click();
    } else {
      // Try via ellipsis menu — hover and click the more button
      await threadItem.hover();
      const moreButton = page
        .locator('[aria-label="More"]')
        .or(page.locator('button:has(svg)').filter({ hasText: '' }).first());
      await moreButton.click();
      await page.getByText(/^usuń$/i).click();
    }

    // Confirm deletion in the alert dialog
    const confirmDelete = page
      .locator('[role="alertdialog"]')
      .getByText(/^usuń$/i);
    await confirmDelete.click();

    // Thread should no longer be visible
    await expect(page.getByText(/thread to be deleted/i)).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test('rename thread updates title in sidebar', async ({ page }) => {
    await page.route('**/api/threads/*', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = buildMockSSE({ content: 'Rename test response.' });
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          body,
        });
      } else {
        await route.fallback();
      }
    });

    // Create a thread
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
    await page.locator('textarea').fill('Thread to rename');
    await page.locator('textarea').press('Enter');
    await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });
    await expect(page.getByText('Rename test response.')).toBeVisible({
      timeout: 15_000,
    });

    // Go to chats and find the thread
    await page.goto(ROUTES.chats);
    const threadItem = page.getByText(/thread to rename/i);
    await expect(threadItem).toBeVisible({ timeout: 10_000 });

    // Open context menu
    await threadItem.click({ button: 'right' });

    // Click rename
    await page.getByText(/zmień nazwę/i).click();

    // Fill in new name in the rename dialog
    const renameInput = page.locator(
      '[role="dialog"] input[type="text"], [role="dialog"] input',
    );
    await renameInput.clear();
    await renameInput.fill('Renamed Thread Title');
    await page.getByText(/zapisz/i).click();

    // Verify renamed thread appears
    await expect(page.getByText('Renamed Thread Title')).toBeVisible({
      timeout: 10_000,
    });
  });
});
