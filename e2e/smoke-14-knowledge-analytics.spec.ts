import { test, expect } from '@playwright/test';
import { ROUTES } from './helpers';

test.describe('Knowledge Analytics (smoke)', () => {
  test('org admin sees Analityka wiedzy link in settings nav', async ({
    page,
  }) => {
    await page.goto(ROUTES.settingsGeneral);

    await expect(
      page.getByRole('link', { name: /analityka wiedzy/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('knowledge analytics page renders without error', async ({ page }) => {
    await page.goto('/pl/settings/knowledge-analytics');

    // Page title visible (nav link + page heading)
    await expect(page.getByText(/analityka wiedzy/i).first()).toBeVisible({
      timeout: 15000,
    });
    // No uncaught error page (Next.js error boundary would show "something went wrong")
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });
});

test.describe('Knowledge Analytics — access control (smoke)', () => {
  test('unauthenticated user cannot access knowledge analytics page', async ({
    browser,
  }) => {
    // Fresh context with no stored auth — simulates a non-logged-in user
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/pl/settings/knowledge-analytics');

    // Should be redirected away from the analytics page (to sign-in or home)
    await expect(page).not.toHaveURL(/knowledge-analytics/, { timeout: 10000 });

    await context.close();
  });
});
