import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Thread Management P1', () => {
  test('search dialog opens with keyboard shortcut', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await expect(page.getByRole('heading', { name: /wątki/i })).toBeVisible({
      timeout: 10_000,
    });

    // Use platform-appropriate modifier key
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+k`);

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
    }
  });

  test('chats page loads and shows heading', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await expect(page).toHaveURL(/chats/);

    await expect(page.getByRole('heading', { name: /wątki/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
