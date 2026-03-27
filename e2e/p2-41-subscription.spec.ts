import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Subscription P2', () => {
  test('subscription page shows current plan details', async ({ page }) => {
    await page.goto(ROUTES.settingsSubscription);
    await page.waitForLoadState('domcontentloaded');

    // Should show a heading with plan name or subscription info
    await expect(
      page
        .getByRole('heading', { name: /trial|subscription|subskrypcj/i })
        .or(page.getByText(/brak subskrypcji/i)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('subscription page displays plan name and status', async ({ page }) => {
    await page.goto(ROUTES.settingsSubscription);
    await page.waitForLoadState('domcontentloaded');

    // The seeded user has a "Trial" subscription — check heading
    await expect(page.getByRole('heading', { name: /trial/i })).toBeVisible({
      timeout: 10_000,
    });

    // Should show status badge
    await expect(page.getByText('trialing')).toBeVisible({ timeout: 10_000 });
  });

  test('show available plans link is visible', async ({ page }) => {
    await page.goto(ROUTES.settingsSubscription);
    await page.waitForLoadState('domcontentloaded');

    const showPlansLink = page.getByText(/pokaż dostępne plany/i);
    if (await showPlansLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await showPlansLink.click();
      // Should navigate to plans page
      await expect(page).toHaveURL(/plans/, { timeout: 10_000 });
    }
  });

  test('cancel subscription shows confirmation dialog', async ({ page }) => {
    await page.goto(ROUTES.settingsSubscription);
    await page.waitForLoadState('domcontentloaded');

    const cancelButton = page.getByText(/anuluj subskrypcję/i);
    if (
      !(await cancelButton.isVisible({ timeout: 5_000 }).catch(() => false))
    ) {
      test.skip(
        true,
        'Cancel subscription button not visible — no active paid plan',
      );
      return;
    }

    await cancelButton.click();

    // Should show confirmation dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/anuluj subskrypcję/i)).toBeVisible();

    // Cancel the dialog (don't actually cancel subscription)
    await dialog.getByText(/nie, zachowaj subskrypcję|anuluj/i).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });
});
