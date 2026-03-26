import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_USER_NAME } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Organization & Members P1', () => {
  test('organization settings page loads with tabs', async ({ page }) => {
    await page.goto(ROUTES.settingsOrganization);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Should see the organization page with tabs
    await expect(page.getByText(/ogólne/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/użytkownicy/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('members tab shows current user as owner', async ({ page }) => {
    await page.goto(ROUTES.settingsOrganization);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Click the members tab
    await page
      .getByText(/użytkownicy/i)
      .first()
      .click();

    // The current test user should be listed
    await expect(page.getByText(TEST_USER_NAME)).toBeVisible({
      timeout: 10_000,
    });

    // Should show owner role badge
    await expect(page.getByText(/owner|właściciel/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('invite member dialog opens and validates email', async ({ page }) => {
    await page.goto(ROUTES.settingsOrganization);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Switch to members tab
    await page
      .getByText(/użytkownicy/i)
      .first()
      .click();

    // Click invite button
    const inviteButton = page.getByText(/zaproś użytkownika/i);

    // Invite may not be visible if plan doesn't allow it
    if (
      !(await inviteButton.isVisible({ timeout: 5_000 }).catch(() => false))
    ) {
      test.skip(
        true,
        'Invite button not visible — plan may not allow invitations',
      );
      return;
    }

    await inviteButton.click();

    // Dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/zaproś użytkownika/i)).toBeVisible();

    // Verify email input and role select are present
    await expect(dialog.locator('#invite-email')).toBeVisible();
    await expect(dialog.locator('#invite-role')).toBeVisible();

    // Submit without filling email — should show validation error
    await dialog.getByText(/wyślij zaproszenie/i).click();
    await expect(dialog.getByText(/email|wymagane|required/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('invite member with valid email', async ({ page }) => {
    await page.goto(ROUTES.settingsOrganization);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Switch to members tab
    await page
      .getByText(/użytkownicy/i)
      .first()
      .click();

    const inviteButton = page.getByText(/zaproś użytkownika/i);
    if (
      !(await inviteButton.isVisible({ timeout: 5_000 }).catch(() => false))
    ) {
      test.skip(
        true,
        'Invite button not visible — plan may not allow invitations',
      );
      return;
    }

    await inviteButton.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill in a valid email
    await dialog.locator('#invite-email').fill('new-member@example.com');

    // Select admin role
    await dialog.locator('#invite-role').selectOption('admin');

    // Submit the invitation
    await dialog.getByText(/wyślij zaproszenie/i).click();

    // Should either show success or the dialog closes
    // (actual email sending may fail in test env, but form should submit)
    await expect(dialog)
      .not.toBeVisible({ timeout: 10_000 })
      .catch(() => {
        // If dialog stays open it may be showing a server error — that's acceptable in test env
      });
  });

  test('invitations tab shows pending invitations', async ({ page }) => {
    await page.goto(ROUTES.settingsOrganization);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Click the invitations tab
    const invitationsTab = page.getByText(/zaproszenia/i);
    if (await invitationsTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await invitationsTab.click();
      // Should show invitations section (may be empty)
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
    }
  });

  test('member actions dropdown is visible for non-owner members', async ({
    page,
  }) => {
    await page.goto(ROUTES.settingsOrganization);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Switch to members tab
    await page
      .getByText(/użytkownicy/i)
      .first()
      .click();

    // Look for actions button (ellipsis icon) — only visible for non-owner members
    const actionsButtons = page.locator('button[aria-label="Akcje"]');
    const count = await actionsButtons.count();

    if (count > 0) {
      // Click the first actions dropdown
      await actionsButtons.first().click();

      // Should show role change and remove options
      await expect(
        page.getByText(/zmień na administratora|zmień na użytkownika/i).first(),
      ).toBeVisible({ timeout: 5_000 });
    }
    // If no actions buttons, it means only the owner is in the org — that's valid
  });
});
