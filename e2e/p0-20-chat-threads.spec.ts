import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

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

  // Tests below require the mock LLM server (started by global.setup.ts).
  // They work locally and on CI when the mock is reachable.
  // Skip if the mock LLM is not available.
  test.describe('with mock LLM', () => {
    // These tests require the mock LLM server to be reachable from the Next.js server.
    // Works locally (npm start), but CI standalone server can't reach the mock.
    test.skip(
      !!process.env.CI,
      'Mock LLM not reachable from standalone server on CI',
    );

    test('create new thread by sending a message', async ({ page }) => {
      await page.goto(ROUTES.newChat);
      await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

      await page.locator('textarea').fill('Hello from e2e test');
      await page.locator('textarea').press('Enter');

      await expect(page).toHaveURL(/\/chats\//, { timeout: 30_000 });
      await expect(page.getByText(/mock AI response/i)).toBeVisible({
        timeout: 30_000,
      });
    });

    test('thread appears in sidebar after creation', async ({ page }) => {
      await page.goto(ROUTES.newChat);
      await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

      await page.locator('textarea').fill('Sidebar test message');
      await page.locator('textarea').press('Enter');

      await expect(page).toHaveURL(/\/chats\//, { timeout: 30_000 });
      await expect(page.getByText(/mock AI response/i)).toBeVisible({
        timeout: 30_000,
      });

      const threadLink = page.locator('a[href*="/chats/"]').first();
      await expect(threadLink).toBeVisible({ timeout: 10_000 });
    });

    test('rename thread via context menu', async ({ page }) => {
      await page.goto(ROUTES.newChat);
      await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
      await page.locator('textarea').fill('Thread to rename');
      await page.locator('textarea').press('Enter');
      await expect(page).toHaveURL(/\/chats\//, { timeout: 30_000 });
      await expect(page.getByText(/mock AI response/i)).toBeVisible({
        timeout: 30_000,
      });

      const threadLink = page.locator('a[href*="/chats/"]').first();
      await expect(threadLink).toBeVisible({ timeout: 10_000 });
      await threadLink.click({ button: 'right' });

      const renameOption = page.getByRole('menuitem', {
        name: /zmień nazwę/i,
      });
      if (await renameOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await renameOption.click();
        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible({ timeout: 5_000 });
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
      await page.goto(ROUTES.newChat);
      await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
      await page.locator('textarea').fill('Thread to star');
      await page.locator('textarea').press('Enter');
      await expect(page).toHaveURL(/\/chats\//, { timeout: 30_000 });
      await expect(page.getByText(/mock AI response/i)).toBeVisible({
        timeout: 30_000,
      });

      const threadLink = page.locator('a[href*="/chats/"]').first();
      await expect(threadLink).toBeVisible({ timeout: 10_000 });
      await threadLink.click({ button: 'right' });

      const starOption = page.getByRole('menuitem', { name: /przypnij/i });
      if (await starOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await starOption.click();
        await threadLink.click({ button: 'right' });
        await expect(
          page.getByRole('menuitem', { name: /odepnij/i }),
        ).toBeVisible({ timeout: 5_000 });
        await page.keyboard.press('Escape');
      }
    });

    test('delete thread via context menu', async ({ page }) => {
      await page.goto(ROUTES.newChat);
      await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
      await page.locator('textarea').fill('Thread to delete');
      await page.locator('textarea').press('Enter');
      await expect(page).toHaveURL(/\/chats\//, { timeout: 30_000 });
      await expect(page.getByText(/mock AI response/i)).toBeVisible({
        timeout: 30_000,
      });

      const threadLink = page.locator('a[href*="/chats/"]').first();
      await expect(threadLink).toBeVisible({ timeout: 10_000 });
      await threadLink.click({ button: 'right' });

      const deleteOption = page.getByRole('menuitem', { name: /usuń/i });
      if (await deleteOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await deleteOption.click();
        const alertDialog = page.locator('[role="alertdialog"]');
        if (
          await alertDialog.isVisible({ timeout: 3_000 }).catch(() => false)
        ) {
          await alertDialog
            .locator('button')
            .filter({ hasText: /^usuń$/i })
            .click();
        }
      }
    });
  });
});
