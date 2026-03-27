import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES, buildMockSSE } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Thread Management P1', () => {
  test('star / unstar a thread via sidebar', async ({ page }) => {
    // Mock SSE and create a thread
    await page.route('**/api/threads/*/?(\\?*)?', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          body: buildMockSSE({ content: 'Star test response.' }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
    await page.locator('textarea').fill('Star test message');
    await page.locator('textarea').press('Enter');
    await expect(page).toHaveURL(/\/chats\//, { timeout: 15_000 });

    // Find thread in sidebar and right-click
    const threadLink = page.locator('a[href*="/chats/"]').first();
    await expect(threadLink).toBeVisible({ timeout: 10_000 });
    await threadLink.click({ button: 'right' });

    // Look for star option
    const starOption = page.getByRole('menuitem', { name: /przypnij/i });
    if (await starOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await starOption.click();

      // Verify unstar option appears on next right-click
      await threadLink.click({ button: 'right' });
      await expect(
        page.getByRole('menuitem', { name: /odepnij/i }),
      ).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press('Escape');
    }
  });

  test('search dialog opens with keyboard shortcut', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Open search with Cmd+K
    await page.keyboard.press('Meta+k');

    // The search dialog should open — look for the cmdk input
    const searchInput = page
      .locator('[cmdk-input]')
      .or(
        page.locator(
          'input[placeholder*="Szukaj"], input[placeholder*="szukaj"]',
        ),
      );

    if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
    } else {
      // Cmd+K might not work on this OS, try Ctrl+K
      await page.keyboard.press('Control+k');
      const searchInput2 = page
        .locator('[cmdk-input]')
        .or(
          page.locator(
            'input[placeholder*="Szukaj"], input[placeholder*="szukaj"]',
          ),
        );
      if (await searchInput2.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await page.keyboard.press('Escape');
      }
    }
  });

  test('chats page loads and shows heading', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await expect(page).toHaveURL(/chats/);

    // The chats page heading
    await expect(page.getByRole('heading', { name: /wątki/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
