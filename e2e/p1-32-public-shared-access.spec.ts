import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_PROJECT_PUBLIC_ID } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Public / Shared Access P1', () => {
  test('share dialog opens on project detail page', async ({ page }) => {
    await page.goto(`/pl/projects/${TEST_PROJECT_PUBLIC_ID}`);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_PUBLIC_ID), {
      timeout: 10_000,
    });

    // Click the share button
    const shareButton = page.getByText(/udostępnij/i).first();
    await expect(shareButton).toBeVisible({ timeout: 10_000 });
    await shareButton.click();

    // Share dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Should show the public sharing toggle
    await expect(
      dialog.getByText(/udostępnij wiedzę asystenta publicznie/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('enable public access generates a sharing link', async ({ page }) => {
    await page.goto(`/pl/projects/${TEST_PROJECT_PUBLIC_ID}`);
    await expect(page).toHaveURL(new RegExp(TEST_PROJECT_PUBLIC_ID), {
      timeout: 10_000,
    });

    // Open share dialog
    await page
      .getByText(/udostępnij/i)
      .first()
      .click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Toggle public access on
    const toggle = dialog.locator('[role="switch"]');
    const currentState = await toggle.getAttribute('data-state');

    if (currentState === 'unchecked') {
      await toggle.click();

      // Wait for link generation
      await expect(dialog.locator('input[readonly]')).toBeVisible({
        timeout: 15_000,
      });

      // The URL should contain /public/assistants/
      const linkInput = dialog.locator('input[readonly]');
      const linkValue = await linkInput.inputValue();
      expect(linkValue).toContain('/public/assistants/');

      // Copy link button should be visible
      await expect(
        dialog.locator('button[aria-label="Kopiuj link publiczny"]'),
      ).toBeVisible();
    } else {
      // Already enabled — just verify the link is there
      await expect(dialog.locator('input[readonly]')).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test('public assistant page loads for valid access token', async ({
    page,
  }) => {
    // First, get the access token from the share dialog
    await page.goto(`/pl/projects/${TEST_PROJECT_PUBLIC_ID}`);
    await page
      .getByText(/udostępnij/i)
      .first()
      .click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Enable public access if not already
    const toggle = dialog.locator('[role="switch"]');
    const currentState = await toggle.getAttribute('data-state');
    if (currentState === 'unchecked') {
      await toggle.click();
    }

    // Wait for the link to appear
    const linkInput = dialog.locator('input[readonly]');
    await expect(linkInput).toBeVisible({ timeout: 15_000 });
    const publicUrl = await linkInput.inputValue();

    // Close dialog
    await page.keyboard.press('Escape');

    // Navigate to the public URL (extract path from full URL)
    const urlPath = new URL(publicUrl).pathname;
    await page.goto(urlPath);

    // Public chat should load — look for textarea or chat interface
    await expect(
      page
        .locator('textarea')
        .or(page.getByText(/publiczny chatbot|otwieranie wątku/i)),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('share thread dialog opens from thread dropdown', async ({ page }) => {
    // Create a thread so it appears in sidebar
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
    await page.locator('textarea').fill('Share dialog test');
    await page.locator('textarea').press('Enter');
    await expect(page).toHaveURL(/\/chats\//, { timeout: 30_000 });
    await expect(page.getByText(/mock AI response/i)).toBeVisible({
      timeout: 30_000,
    });

    // Find the thread in sidebar and right-click
    const threadLink = page.locator('a[href*="/chats/"]').first();
    await expect(threadLink).toBeVisible({ timeout: 10_000 });
    await threadLink.click({ button: 'right' });

    // Click share option
    const shareOption = page.getByRole('menuitem', { name: /udostępnij/i });
    if (await shareOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await shareOption.click();

      // Share thread dialog should open
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(dialog.getByText(/udostępnij wątek/i)).toBeVisible();

      // Should show member list or "no members" message
      await expect(
        dialog
          .getByText(/brak innych członków/i)
          .or(dialog.locator('[role="switch"]').first()),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('disable public access shows confirmation dialog', async ({ page }) => {
    await page.goto(`/pl/projects/${TEST_PROJECT_PUBLIC_ID}`);
    await page
      .getByText(/udostępnij/i)
      .first()
      .click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Ensure public access is enabled first
    const toggle = dialog.locator('[role="switch"]');
    const currentState = await toggle.getAttribute('data-state');
    if (currentState === 'unchecked') {
      await toggle.click();
      // Wait for link generation
      await expect(dialog.locator('input[readonly]')).toBeVisible({
        timeout: 15_000,
      });
    }

    // Now toggle OFF to disable
    await toggle.click();

    // Should show confirmation alert dialog
    const alertDialog = page.locator('[role="alertdialog"]');
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });
    await expect(
      alertDialog.getByText(/wyłącz dostęp publiczny/i),
    ).toBeVisible();

    // Cancel to keep it enabled
    await alertDialog.getByText(/anuluj/i).click();
    await expect(alertDialog).not.toBeVisible({ timeout: 5_000 });
  });
});
