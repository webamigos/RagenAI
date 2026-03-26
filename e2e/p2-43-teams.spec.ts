import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Teams P2', () => {
  test('teams page loads', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Should show teams page title or empty state
    await expect(
      page.getByText(/zespoły/i).or(page.getByText(/brak zespołów/i)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('create team dialog opens and validates', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Click create team button
    const createButton = page.getByText(/utwórz zespół/i);
    await expect(createButton).toBeVisible({ timeout: 10_000 });
    await createButton.click();

    // Dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/utwórz zespół/i)).toBeVisible();

    // Team name input should be present
    const nameInput = dialog.locator('#team-name');
    await expect(nameInput).toBeVisible();

    // Try to submit without a name — button should be disabled
    const submitButton = dialog.locator('button[type="submit"]');
    await expect(submitButton).toBeDisabled();

    // Fill in team name
    await nameInput.fill('E2E Test Team');

    // Button should be enabled now
    await expect(submitButton).toBeEnabled();
  });

  test('create a new team', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    await page.getByText(/utwórz zespół/i).click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill in team name
    await dialog.locator('#team-name').fill('E2E Auto Team');

    // Submit
    await dialog.locator('button[type="submit"]').click();

    // Dialog should close and team should appear in the list
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('E2E Auto Team')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('select a team to see team details', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Look for a team in the list
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

    // Select the team
    const teamItem = page.getByText('E2E Auto Team');
    if (!(await teamItem.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No team available to delete');
      return;
    }

    await teamItem.click();

    // Click delete team button
    const deleteButton = page.getByText(/usuń zespół/i);
    await expect(deleteButton).toBeVisible({ timeout: 10_000 });
    await deleteButton.click();

    // Confirm deletion
    const alertDialog = page.locator('[role="alertdialog"]');
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });
    await alertDialog
      .getByText(/usuń zespół/i)
      .last()
      .click();

    // Team should be removed
    await expect(page.getByText('E2E Auto Team')).not.toBeVisible({
      timeout: 10_000,
    });
  });
});
