import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES, buildMockSSE } from './helpers';

test.use({ storageState: AUTH_FILE });

/**
 * Helper: create a thread and return its URL.
 */
async function createThread(
  page: import('@playwright/test').Page,
  message: string,
  responseContent: string,
) {
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
  await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });
  await expect(page.getByText(responseContent)).toBeVisible({
    timeout: 15_000,
  });

  return page.url();
}

test.describe('Thread Management P1', () => {
  test('star / unstar a thread', async ({ page }) => {
    await createThread(page, 'Star test message', 'Star test response.');

    // Navigate to chats list
    await page.goto(ROUTES.chats);
    const threadItem = page.getByText(/star test message/i);
    await expect(threadItem).toBeVisible({ timeout: 10_000 });

    // Open context menu and star the thread
    await threadItem.click({ button: 'right' });
    await page.getByText(/przypnij/i).click();

    // Thread should now be pinned — verify by checking the unstar option
    await threadItem.click({ button: 'right' });
    await expect(page.getByText(/odepnij/i)).toBeVisible({ timeout: 5_000 });

    // Unstar it
    await page.getByText(/odepnij/i).click();

    // Verify star option is back
    await threadItem.click({ button: 'right' });
    await expect(page.getByText(/przypnij/i)).toBeVisible({ timeout: 5_000 });
    // Close context menu by pressing Escape
    await page.keyboard.press('Escape');
  });

  test('search threads returns matching results', async ({ page }) => {
    // Create a thread with a distinctive message
    await createThread(
      page,
      'Unique search target alpha',
      'Search target response.',
    );

    await page.goto(ROUTES.chats);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Open search — look for a search button or input
    const searchButton = page
      .locator('[aria-label="Search"]')
      .or(page.locator('button:has(svg)').filter({ hasText: '' }));

    // Try clicking the search button in the sidebar
    const sidebarSearch = page.locator(
      '[aria-label="Search"], [aria-label="Szukaj"]',
    );
    if (await sidebarSearch.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sidebarSearch.click();
    } else {
      // Fallback: use keyboard shortcut Cmd+K or Ctrl+K
      await page.keyboard.press('Meta+k');
    }

    // The search dialog should open
    const searchInput = page.getByPlaceholder(/szukaj czatów i asystentów/i);
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Type search query
    await searchInput.fill('alpha');

    // Wait for results (300ms debounce + network)
    await page.waitForTimeout(500);

    // Should find the thread with "alpha" in the message
    await expect(page.getByText(/unique search target alpha/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('search shows no results for non-matching query', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Open search
    await page.keyboard.press('Meta+k');

    const searchInput = page.getByPlaceholder(/szukaj czatów i asystentów/i);
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Search for something that doesn't exist
    await searchInput.fill('xyznonexistent999');

    // Wait for debounce
    await page.waitForTimeout(500);

    // Should show "no results"
    await expect(page.getByText(/brak wyników/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('thread list loads on chats page', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await expect(page).toHaveURL(/chats/);

    // The chats page should show the threads list
    await expect(page.getByText(/wątki/i)).toBeVisible({ timeout: 10_000 });
  });
});
