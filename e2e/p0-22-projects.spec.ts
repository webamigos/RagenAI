import { test, expect } from '@playwright/test';

import {
  AUTH_FILE,
  TEST_PROJECT_TITLE,
  TEST_PROJECT_PUBLIC_ID,
} from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Projects P0', () => {
  test('create a new project', async ({ page }) => {
    await page.goto(ROUTES.projects);
    await expect(page).toHaveURL(/projects/, { timeout: 10_000 });

    // Click "Nowy asystent" (create project) button
    await page.getByText(/nowy asystent/i).click();

    // Dialog should appear with the title input
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill in project name
    const titleInput = dialog.locator('input#title');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('E2E New Project');

    // Click "Stwórz" (create) submit button
    await dialog.getByText(/^stwórz$/i).click();

    // Should show success toast
    await expect(
      page.getByText(/asystent został pomyślnie utworzony/i),
    ).toBeVisible({ timeout: 10_000 });

    // Should navigate to the new project page
    await expect(page).toHaveURL(/\/projects\//, { timeout: 10_000 });
  });

  test('project detail page loads with correct title', async ({ page }) => {
    await page.goto(`/pl/projects/${TEST_PROJECT_PUBLIC_ID}`);

    // The project title should be visible
    await expect(page.getByText(TEST_PROJECT_TITLE)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('set project system prompt / instructions', async ({ page }) => {
    await page.goto(`/pl/projects/${TEST_PROJECT_PUBLIC_ID}`);
    await expect(page.getByText(TEST_PROJECT_TITLE)).toBeVisible({
      timeout: 10_000,
    });

    // Click the instructions section to open the dialog
    // Look for "Dodaj instrukcje" or the instructions card
    const instructionsButton = page
      .getByText(/dodaj instrukcje|instrukcje/i)
      .first();
    await instructionsButton.click();

    // Instructions dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/instrukcje asystenta/i)).toBeVisible();

    // Fill in the instructions textarea
    const textarea = dialog.locator('textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill(
      'You are a helpful test assistant. Always respond in Polish.',
    );

    // Click save
    await dialog.getByText(/^zapisz$/i).click();

    // Should show success toast
    await expect(page.getByText(/instrukcja została zapisana/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('project creation validates empty title', async ({ page }) => {
    await page.goto(ROUTES.projects);
    await expect(page).toHaveURL(/projects/, { timeout: 10_000 });

    // Click create
    await page.getByText(/nowy asystent/i).click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Try to submit without filling in the title
    await dialog.getByText(/^stwórz$/i).click();

    // Should show validation error (title is required)
    await expect(dialog.getByText(/wymagane|required|tytuł/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('project appears in projects list after creation', async ({ page }) => {
    await page.goto(ROUTES.projects);
    await expect(page).toHaveURL(/projects/, { timeout: 10_000 });

    // The seeded test project should be visible in the list
    await expect(page.getByText(TEST_PROJECT_TITLE)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('navigate to project from projects list', async ({ page }) => {
    await page.goto(ROUTES.projects);
    await expect(page).toHaveURL(/projects/, { timeout: 10_000 });

    // Click on the test project
    await page.getByText(TEST_PROJECT_TITLE).click();

    // Should navigate to project detail
    await expect(page).toHaveURL(
      new RegExp(`/projects/${TEST_PROJECT_PUBLIC_ID}`),
      { timeout: 10_000 },
    );

    // Project title should be visible on the detail page
    await expect(page.getByText(TEST_PROJECT_TITLE)).toBeVisible({
      timeout: 10_000,
    });
  });
});
