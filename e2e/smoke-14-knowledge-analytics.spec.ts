import { test, expect } from '@playwright/test';
import { ROUTES, login } from './helpers';

test.describe('Knowledge Analytics (smoke)', () => {
  test('org admin sees Analityka wiedzy link in settings nav', async ({
    page,
  }) => {
    await login(page);
    await page.goto(ROUTES.settingsGeneral);

    await expect(
      page.getByRole('link', { name: /analityka wiedzy/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('knowledge analytics page renders without error', async ({ page }) => {
    await login(page);
    await page.goto('/pl/settings/knowledge-analytics');

    await expect(page.getByText(/analityka wiedzy/i).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/łączna liczba pytań/i)).toBeVisible({
      timeout: 15000,
    });
  });
});
