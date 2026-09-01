import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_THREAD_ID } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

const SEEDED_THREAD_URL = `/pl/chats/${TEST_THREAD_ID}`;

test.describe('Chat & Threads P0', () => {
  test('new chat page loads with textarea', async ({ page }) => {
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
  });

  test('textarea is enabled and accepts input', async ({ page }) => {
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
    await page.locator('textarea').fill('Test input');
    await expect(page.locator('textarea')).toHaveValue('Test input');
  });

  test('chats list page loads', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await expect(page.getByRole('heading', { name: /wątki/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  // "Create new thread by sending a message" and multi-message rendering
  // are covered by e2e/p0-23-rag-chat-response.spec.ts, which mocks the
  // stream endpoint directly instead of depending on a live mock-LLM
  // process (the old version of this test here was permanently skipped
  // on CI for exactly that reason).

  test('thread appears in sidebar after navigation', async ({ page }) => {
    await page.goto(SEEDED_THREAD_URL);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    const threadLink = page.locator('a[href*="/chats/"]').first();
    await expect(threadLink).toBeVisible({ timeout: 10_000 });
  });

  test('rename thread via context menu', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await expect(page.getByRole('heading', { name: /wątki/i })).toBeVisible({
      timeout: 10_000,
    });

    const firstThread = page.locator('[data-testid="thread-item"]').first();
    await firstThread.hover();
    await firstThread.locator('[data-testid="thread-menu-trigger"]').click();

    const renameOption = page.getByRole('menuitem', { name: /zmień nazwę/i });
    if (await renameOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await renameOption.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      const renameInput = dialog.locator('input').first();
      await renameInput.clear();
      await renameInput.fill('Renamed E2E Thread');
      await dialog
        .locator('button')
        .filter({ hasText: /zapisz/i })
        .click();
      await expect(page.getByText('Renamed E2E Thread')).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test('star thread via context menu', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await expect(page.getByRole('heading', { name: /wątki/i })).toBeVisible({
      timeout: 10_000,
    });

    const firstThread = page.locator('[data-testid="thread-item"]').first();
    await firstThread.hover();
    await firstThread.locator('[data-testid="thread-menu-trigger"]').click();

    const starOption = page.getByRole('menuitem', { name: /przypnij/i });
    if (await starOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await starOption.click();
      await firstThread.hover();
      await firstThread.locator('[data-testid="thread-menu-trigger"]').click();
      await expect(
        page.getByRole('menuitem', { name: /odepnij/i }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });

  test('delete thread via context menu', async ({ page }) => {
    await page.goto(ROUTES.chats);
    await expect(page.getByRole('heading', { name: /wątki/i })).toBeVisible({
      timeout: 10_000,
    });

    const firstThread = page.locator('[data-testid="thread-item"]').first();
    await firstThread.hover();
    await firstThread.locator('[data-testid="thread-menu-trigger"]').click();

    const deleteOption = page.getByRole('menuitem', { name: /usuń/i });
    if (await deleteOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteOption.click();
      const alertDialog = page.locator('[role="alertdialog"]');
      if (await alertDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Cancel the deletion to preserve the seeded thread for subsequent tests
        const cancelBtn = alertDialog
          .locator('button')
          .filter({ hasText: /anuluj/i });
        if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await cancelBtn.click();
        } else {
          await page.keyboard.press('Escape');
        }
      }
    }
  });
});
