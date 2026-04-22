import { test, expect } from '@playwright/test';

import fs from 'fs';
import { AUTH_FILE, TEST_ORG_ID } from './constants';
import { ROUTES, reLogin } from './helpers';

/**
 * Delete teams created by earlier runs of this spec. Each test in the file
 * adds an `E2E …` team without cleaning up; over many CI runs the teams
 * page server-render grows linearly and tests 3-4 hit the 30s timeout.
 */
async function cleanupE2ETeams() {
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.team.deleteMany({
      where: {
        organizationId: TEST_ORG_ID,
        OR: [
          { name: { startsWith: 'E2E ' } },
          { name: { startsWith: 'E2E_' } },
        ],
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(60_000);
  await cleanupE2ETeams();
  await reLogin(browser);
});
test.beforeEach(async ({ page, context }) => {
  await context.clearCookies();
  const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  await context.addCookies(state.cookies);
  await page.goto('/pl/new');
  await page.waitForLoadState('domcontentloaded');
});

/**
 * Wait until the teams page is hydrated and interactive. The page does a
 * `Promise.all` with per-team LiteLLM spend-log fetches, so first render can
 * take 10 s+ in CI — wait for the heading AND the create button explicitly
 * instead of racing them.
 */
async function waitForTeamsPageReady(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: /zespoły/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('button', { name: /utwórz zespół/i }),
  ).toBeVisible({ timeout: 30_000 });
}

/** Create a team with the given name via the UI dialog and wait for dialog to close. */
async function createTeamViaUI(
  page: import('@playwright/test').Page,
  teamName: string,
) {
  await waitForTeamsPageReady(page);
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
    test.setTimeout(60_000);
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
    test.setTimeout(90_000);
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

    // Wait for alert dialog to close, then force a fresh server render so the
    // assertion reflects DB state instead of the client's optimistic list.
    await expect(alertDialog).not.toBeVisible({ timeout: 10_000 });
    await page.goto(ROUTES.settingsTeams);
    await page.waitForLoadState('domcontentloaded');
    await waitForTeamsPageReady(page);
    await expect(page.getByText(teamName, { exact: true })).not.toBeVisible({
      timeout: 10_000,
    });
  });
});
