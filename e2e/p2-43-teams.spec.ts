import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Teams P2', () => {
  test('teams page loads', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Should show teams page heading
    await expect(page.getByRole('heading', { name: /zespoły/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('create team dialog opens and validates', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Click create team button (use role to avoid matching empty state text)
    await page.getByRole('button', { name: /utwórz zespół/i }).click();

    // Wait for dialog input to appear (Headless UI)
    const nameInput = page.locator('#team-name');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });

    // Try to submit without a name — button should be disabled
    const submitButton = page.locator(
      '[role="dialog"] button[type="submit"], [data-headlessui-state="open"] button[type="submit"]',
    );
    await expect(submitButton).toBeDisabled();

    // Fill in team name
    await nameInput.fill('E2E Test Team');

    // Button should be enabled now
    await expect(submitButton).toBeEnabled();
  });

  test('create a new team', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    await page.getByRole('button', { name: /utwórz zespół/i }).click();

    // Wait for dialog input
    const nameInput = page.locator('#team-name');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });

    await nameInput.fill('E2E Auto Team');

    // Submit
    const submitButton = page.locator(
      '[role="dialog"] button[type="submit"], [data-headlessui-state="open"] button[type="submit"]',
    );
    await submitButton.click();

    // Team should appear in the list
    await expect(page.getByText('E2E Auto Team')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('select a team to see team details', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const teamItem = page.getByText('E2E Auto Team');
    if (!(await teamItem.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No team available to select');
      return;
    }

    await teamItem.click();

    // Team detail view should show
    await expect(
      page
        .getByText(/dodaj użytkownika/i)
        .or(page.getByText(/brak użytkowników/i)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('delete a team', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    const teamItem = page.getByText('E2E Auto Team');
    if (!(await teamItem.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No team available to delete');
      return;
    }

    await teamItem.click();

    // Click delete team button
    const deleteButton = page.getByRole('button', { name: /usuń zespół/i });
    await expect(deleteButton).toBeVisible({ timeout: 10_000 });
    await deleteButton.click();

    // Confirm deletion
    const alertDialog = page.locator('[role="alertdialog"]');
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });
    await alertDialog
      .locator('button')
      .filter({ hasText: /usuń/i })
      .last()
      .click();

    // Team should be removed
    await expect(page.getByText('E2E Auto Team')).not.toBeVisible({
      timeout: 10_000,
    });
  });
});
