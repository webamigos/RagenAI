import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

/** Create a team with the given name via the UI dialog and wait for dialog to close. */
async function createTeamViaUI(
  page: import('@playwright/test').Page,
  teamName: string,
) {
  await page.getByRole('button', { name: /utwórz zespół/i }).click();
  const nameInput = page.locator('#team-name');
  await expect(nameInput).toBeVisible({ timeout: 5_000 });
  await nameInput.fill(teamName);
  const submitButton = page.locator(
    '[role="dialog"] button[type="submit"], [data-headlessui-state="open"] button[type="submit"]',
  );
  await submitButton.click();

  // Wait for Headless UI dialog to close (animation + portal removal)
  await page
    .locator('#team-name')
    .waitFor({ state: 'detached', timeout: 10_000 });
  // Wait for the team to appear in the list
  await expect(page.getByText(teamName, { exact: true })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Teams P2', () => {
  test('teams page loads', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: /zespoły/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('create team dialog opens and validates', async ({ page }) => {
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /utwórz zespół/i }).click();

    const nameInput = page.locator('#team-name');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });

    const submitButton = page.locator(
      '[role="dialog"] button[type="submit"], [data-headlessui-state="open"] button[type="submit"]',
    );
    await expect(submitButton).toBeDisabled();

    await nameInput.fill('Validation Test Team');
    await expect(submitButton).toBeEnabled();
  });

  test('create a new team and view details', async ({ page }) => {
    const teamName = `E2E Team ${Date.now()}`;

    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('domcontentloaded');

    await createTeamViaUI(page, teamName);

    // Click the team — use exact match to avoid overlay issues
    await page.getByText(teamName, { exact: true }).click();

    // Team detail view should show — use role-based selector to avoid strict mode
    await expect(
      page.getByRole('button', { name: /dodaj użytkownika/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('delete a team', async ({ page }) => {
    const teamName = `E2E Del ${Date.now()}`;

    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('domcontentloaded');

    await createTeamViaUI(page, teamName);

    // Select it
    await page.getByText(teamName, { exact: true }).click();

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

    // Wait for alert dialog to close, then verify team is removed
    await expect(alertDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(teamName, { exact: true })).not.toBeVisible({
      timeout: 10_000,
    });
  });
});
