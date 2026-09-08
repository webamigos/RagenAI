import { test, expect } from '@playwright/test';
import { ROUTES } from './helpers';

test.describe('Knowledge Analytics (smoke)', () => {
  test('org admin sees Analityka wiedzy link in the organization nav', async ({
    page,
  }) => {
    // Not the settings nav: the page is organization-scoped and moved to
    // /organization/, where the layout enforces the admin check once. It was
    // listed under personal settings while declaring `requireRole: 'orgAdmin'`.
    await page.goto(ROUTES.settingsPromptManagement);

    await expect(
      page.getByRole('link', { name: /analityka wiedzy/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('the old settings path redirects rather than 404s', async ({ page }) => {
    // The link lived in the sidebar footer and in the upload dialog, so the
    // URL is in circulation; without the redirect the settings catch-all
    // would land those on General with no explanation.
    await page.goto('/pl/settings/knowledge-analytics');

    await expect(page).toHaveURL(/organization\/knowledge-analytics/, {
      timeout: 15000,
    });
  });

  test('knowledge analytics page renders without error', async ({ page }) => {
    await page.goto('/pl/organization/knowledge-analytics');

    // Page title visible (nav link + page heading)
    await expect(page.getByText(/analityka wiedzy/i).first()).toBeVisible({
      timeout: 15000,
    });
    // No uncaught error page (Next.js error boundary would show "something went wrong")
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });
});
