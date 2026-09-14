import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_PROJECT_TITLE, TEST_PROJECT_ID } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Projects P0', () => {
  test('create a new project', async ({ page }) => {
    await page.goto(ROUTES.projects);
    await expect(page).toHaveURL(/projects/, { timeout: 10_000 });

    // Click "Nowy asystent" (create project) button
    await page.getByRole('button', { name: /nowy asystent/i }).click();

    // Wait for the dialog panel to appear (Headless UI renders DialogPanel inside Dialog)
    const titleInput = page.locator('input#title');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });

    // Fill in project name
    await titleInput.fill('E2E New Project');

    // Click "Stwórz" (create) submit button
    await page.getByRole('button', { name: /^stwórz$/i }).click();

    // Should show success toast
    await expect(
      page.getByText(/asystent został pomyślnie utworzony/i),
    ).toBeVisible({ timeout: 10_000 });

    // Should navigate to the new project page
    await expect(page).toHaveURL(/\/projects\//, { timeout: 10_000 });
  });

  test('project detail page loads with correct title', async ({ page }) => {
    await page.goto(`/pl/projects/${TEST_PROJECT_ID}`);

    // The project title should be visible
    await expect(page.getByText(TEST_PROJECT_TITLE)).toBeVisible({
      timeout: 10_000,
    });
  });

  /**
   * Opens the instructions dialog, saves an instruction, then clears it again.
   *
   * The clearing half is not decoration. This writes to the seeded project,
   * and `evals/rag-benchmark` answers its questions as the same tenant against
   * the same `ragen_e2e` database. The instruction left behind here used to be
   * "Always respond in Polish", so a benchmark run afterwards answered every
   * English question in Polish and scored 18/24 instead of 20/24 — see
   * docs/rag-baseline-2026-09-14-before-the-gateway.md for how long that took
   * to diagnose, and why it did not look like contamination.
   *
   * The harness now pins the instruction itself, which is the real fix, since
   * any test or a stray click could leave state. This half is the other side
   * of it: a test that changes shared state puts it back. It also covers
   * clearing an instruction, which nothing else did.
   */
  test('set and clear project system prompt / instructions', async ({
    page,
  }) => {
    await page.goto(`/pl/projects/${TEST_PROJECT_ID}`);
    await expect(page.getByText(TEST_PROJECT_TITLE)).toBeVisible({
      timeout: 10_000,
    });

    const openDialog = async () => {
      await page
        .getByText(/dodaj instrukcje|instrukcje/i)
        .first()
        .click();
      const textarea = page.locator('[role="dialog"] textarea');
      await expect(textarea).toBeVisible({ timeout: 5_000 });
      return textarea;
    };

    const save = async () => {
      await page
        .locator('[role="dialog"]')
        .getByRole('button', { name: /^zapisz$/i })
        .click();
      await expect(page.getByText(/instrukcja została zapisana/i)).toBeVisible({
        timeout: 10_000,
      });
    };

    const textarea = await openDialog();
    await textarea.fill(
      'You are a helpful test assistant. Always respond in Polish.',
    );
    await save();

    // Put it back. Reopening also proves the value round-tripped rather than
    // only that the toast appeared.
    const reopened = await openDialog();
    await expect(reopened).toHaveValue(
      'You are a helpful test assistant. Always respond in Polish.',
    );
    await reopened.fill('');
    await save();

    await expect(await openDialog()).toHaveValue('');
  });

  test('project creation validates empty title', async ({ page }) => {
    await page.goto(ROUTES.projects);
    await expect(page).toHaveURL(/projects/, { timeout: 10_000 });

    // Click create
    await page.getByRole('button', { name: /nowy asystent/i }).click();

    // Wait for the input to appear
    const titleInput = page.locator('input#title');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });

    // Try to submit without filling in the title
    await page.getByRole('button', { name: /^stwórz$/i }).click();

    // Should show validation error (title is required).
    //
    // Located by the field's own error id. This used to read
    // `#input-error, [class*="text-red"]`, which tied a behavioural test to a
    // Tailwind palette class: tokenising the colours renamed it to
    // `text-destructive` and the test failed while the message rendered
    // perfectly. The element already carried `id="title-error"` and
    // `role="alert"`.
    //
    // The id rather than `getByRole('alert').first()`, because `.first()`
    // would be satisfied by any visible alert on the page — including one
    // that has nothing to do with the empty title.
    await expect(page.locator('#title-error')).toBeVisible({ timeout: 5_000 });
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
    await expect(page).toHaveURL(new RegExp(`/projects/${TEST_PROJECT_ID}`), {
      timeout: 10_000,
    });

    // Project title should be visible on the detail page
    await expect(page.getByText(TEST_PROJECT_TITLE)).toBeVisible({
      timeout: 10_000,
    });
  });
});
