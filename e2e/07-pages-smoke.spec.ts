import { test, expect } from '@playwright/test';

import { TEST_PROJECT_PUBLIC_ID } from './constants';
import { ROUTES } from './helpers';

/**
 * Smoke tests for all authenticated pages.
 * Each test navigates to a page and verifies it loads without errors
 * by checking for a key visible element.
 */
test.describe('Authenticated pages smoke tests', () => {
  test.describe('Main pages', () => {
    test('new chat page loads', async ({ page }) => {
      await page.goto(ROUTES.newChat);
      await page.waitForURL('**/pl/new', { timeout: 15_000 });
      // The page should have the chat textarea/input area
      await expect(page.locator('textarea').first()).toBeVisible({
        timeout: 10_000,
      });
    });

    test('chats page loads', async ({ page }) => {
      await page.goto(ROUTES.chats);
      await expect(page).toHaveURL(/chats/);
      await expect(page.getByText(/wątki/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    test('assistants page loads (redirects to projects)', async ({ page }) => {
      await page.goto(ROUTES.assistants);
      // Server-side redirect to /projects — URL may stay as /assistants
      await expect(page.getByText(/asystenci/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    test('projects page loads', async ({ page }) => {
      await page.goto(ROUTES.projects);
      await expect(page).toHaveURL(/projects/);
      await expect(page.getByText(/asystenci/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    test('project detail page loads', async ({ page }) => {
      await page.goto(`/pl/projects/${TEST_PROJECT_PUBLIC_ID}`);
      await expect(page).toHaveURL(
        new RegExp(`projects/${TEST_PROJECT_PUBLIC_ID}`),
      );
      // Project page should show the project title or content area
      await expect(page.getByText(/E2E Test Project/i)).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test.describe('Knowledge pages', () => {
    test('knowledge documents list loads', async ({ page }) => {
      await page.goto(ROUTES.knowledgeDocuments);
      await expect(page).toHaveURL(/documents-list/);
      // Page should render without error (sidebar nav or page content visible)
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    });

    test('knowledge create document page loads', async ({ page }) => {
      await page.goto(ROUTES.knowledgeCreate);
      await expect(page).toHaveURL(/create-document/);
      await expect(page.getByText(/stwórz dokument/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    test('knowledge add from URL page loads', async ({ page }) => {
      await page.goto(ROUTES.knowledgeFromUrl);
      await expect(page).toHaveURL(/add-from-url/);
      await expect(page.getByText(/dodaj wiedzę z linku/i).first()).toBeVisible(
        { timeout: 10_000 },
      );
    });

    test('knowledge upload page loads', async ({ page }) => {
      await page.goto(ROUTES.knowledgeUpload);
      await expect(page).toHaveURL(/upload-files/);
      await expect(page.locator('input[type="file"]')).toBeAttached({
        timeout: 10_000,
      });
    });
  });

  test.describe('User pages', () => {
    test('user profile page loads', async ({ page }) => {
      await page.goto(ROUTES.userProfile);
      await expect(page).toHaveURL(/user\/profile/);
      await expect(page.getByText(/mój profil/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    test('support page loads', async ({ page }) => {
      await page.goto(ROUTES.support);
      await expect(page).toHaveURL(/support/);
      await expect(
        page.getByText(/zgłoś nam swoje uwagi/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Settings pages', () => {
    test('settings general page loads', async ({ page }) => {
      await page.goto(ROUTES.settingsGeneral);
      await expect(page).toHaveURL(/settings\/general/);
      await expect(
        page.getByText(/wybierz jak aplikacja wygląda/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('settings account page loads', async ({ page }) => {
      await page.goto(ROUTES.settingsAccount);
      await expect(page).toHaveURL(/settings\/account/);
      await expect(page.getByText(/konto/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    test('settings connectors page loads', async ({ page }) => {
      await page.goto(ROUTES.settingsConnectors);
      await expect(page).toHaveURL(/settings\/connectors/);
      await expect(page.getByText(/integracje/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    test('settings organization page loads', async ({ page }) => {
      await page.goto(ROUTES.settingsOrganization);
      await expect(page).toHaveURL(/settings\/organization-profile/);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    });

    test('settings prompt management page loads', async ({ page }) => {
      await page.goto(ROUTES.settingsPromptManagement);
      await expect(page).toHaveURL(/settings\/prompt-management/);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    });

    test('settings subscription page loads', async ({ page }) => {
      await page.goto(ROUTES.settingsSubscription);
      await expect(page).toHaveURL(/settings\/subscription/);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    });

    test('settings teams page loads', async ({ page }) => {
      await page.goto(ROUTES.settingsTeams);
      await expect(page).toHaveURL(/settings\/teams/);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    });

    test('settings users page loads (admin)', async ({ page }) => {
      await page.goto(ROUTES.settingsUsers);
      await expect(page).toHaveURL(/settings\/users/);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    });

    test('settings AI usage page loads (admin)', async ({ page }) => {
      await page.goto(ROUTES.settingsAiUsage);
      await expect(page).toHaveURL(/settings\/ai-usage/);
      await expect(page.getByText(/AI Usage/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    test('settings disk usage page loads (admin)', async ({ page }) => {
      await page.goto(ROUTES.settingsDiskUsage);
      await expect(page).toHaveURL(/settings\/disk-usage/);
      await expect(page.getByText(/Disk Usage/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });
});
