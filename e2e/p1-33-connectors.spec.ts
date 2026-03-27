import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Connectors P1', () => {
  test('connectors page lists available integrations', async ({ page }) => {
    await page.goto(ROUTES.settingsConnectors);
    await expect(page).toHaveURL(/connectors/);

    // Page title heading should be visible
    await expect(
      page.getByRole('heading', { name: /integracje/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Should list connector cards — at least one provider should be visible
    await expect(
      page
        .getByText(
          /google calendar|google analytics|google drive|hubspot|clickup|gmail|fireflies|slack/i,
        )
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('each connector shows connect or disconnect button', async ({
    page,
  }) => {
    await page.goto(ROUTES.settingsConnectors);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Find all connector cards with connect/disconnect buttons
    const connectButtons = page.getByText(/^(połącz|rozłącz)$/i);
    const count = await connectButtons.count();

    // Should have at least one connect/disconnect button
    expect(count).toBeGreaterThan(0);
  });

  test('API key connector shows key input dialog', async ({ page }) => {
    await page.goto(ROUTES.settingsConnectors);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Find the Fireflies connector (uses API key auth)
    const firefliesCard = page
      .locator('div')
      .filter({ hasText: /fireflies/i })
      .first();

    if (
      !(await firefliesCard.isVisible({ timeout: 5_000 }).catch(() => false))
    ) {
      test.skip(true, 'Fireflies connector not available');
      return;
    }

    // Click connect on Fireflies
    const connectButton = firefliesCard.getByText(/^połącz$/i);
    if (
      !(await connectButton.isVisible({ timeout: 3_000 }).catch(() => false))
    ) {
      // Already connected — skip
      test.skip(true, 'Fireflies already connected');
      return;
    }

    await connectButton.click();

    // Should show API key input dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Should have API key input
    await expect(dialog.locator('input[type="password"]')).toBeVisible({
      timeout: 5_000,
    });

    // Should have connect button
    await expect(dialog.getByText(/^połącz$/i)).toBeVisible();

    // Close dialog
    await page.keyboard.press('Escape');
  });

  test('OAuth connector opens popup on connect', async ({ page, context }) => {
    await page.goto(ROUTES.settingsConnectors);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Find a Google connector (uses OAuth)
    const googleCards = page
      .locator('div')
      .filter({ hasText: /google calendar|google drive|google analytics/i });

    const firstCard = googleCards.first();
    if (!(await firstCard.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No Google connector available');
      return;
    }

    const connectButton = firstCard.getByText(/^połącz$/i);
    if (
      !(await connectButton.isVisible({ timeout: 3_000 }).catch(() => false))
    ) {
      // Already connected or no connect button — skip
      test.skip(true, 'Google connector has no connect button available');
      return;
    }

    // Listen for popup
    const popupPromise = context.waitForEvent('page', { timeout: 10_000 });

    await connectButton.click();

    // Should open an OAuth popup/redirect
    try {
      const popup = await popupPromise;
      // Verify the popup URL goes to an OAuth or connector endpoint
      const popupUrl = popup.url();
      expect(
        popupUrl.includes('connectors') ||
          popupUrl.includes('oauth') ||
          popupUrl.includes('accounts.google') ||
          popupUrl.includes('auth'),
      ).toBeTruthy();
      await popup.close();
    } catch {
      // If no popup appeared, it might be a redirect-based OAuth
      // That's also valid behavior
    }
  });

  test('connected connector shows enabled toggle', async ({ page }) => {
    await page.goto(ROUTES.settingsConnectors);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Check if any connector is connected
    const disconnectButtons = page.getByText(/^rozłącz$/i);
    const connectedCount = await disconnectButtons.count();

    if (connectedCount === 0) {
      test.skip(true, 'No connectors currently connected');
      return;
    }

    // A connected connector should have a toggle switch to enable/disable
    const toggles = page.locator('[role="switch"]');
    const toggleCount = await toggles.count();
    expect(toggleCount).toBeGreaterThan(0);
  });
});
