import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_USER_NAME } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

test.describe('Settings P2', () => {
  test.describe('Theme', () => {
    test('switch to dark theme', async ({ page }) => {
      await page.goto(ROUTES.settingsGeneral);
      await expect(page).toHaveURL(/settings\/general/);
      await expect(
        page.getByText(/wybierz jak aplikacja wygląda/i),
      ).toBeVisible({ timeout: 10_000 });

      // Click dark theme button
      await page.getByText(/ciemny/i).click();

      // The <html> element should have class "dark"
      await expect(page.locator('html')).toHaveClass(/dark/, {
        timeout: 5_000,
      });
    });

    test('switch to light theme', async ({ page }) => {
      await page.goto(ROUTES.settingsGeneral);
      await expect(page).toHaveURL(/settings\/general/);

      // Click light theme button (exact match to avoid "Energiczny i jasny" voice option)
      await page.getByRole('button', { name: 'Jasny', exact: true }).click();

      // The <html> element should NOT have class "dark"
      await expect(page.locator('html')).not.toHaveClass(/dark/, {
        timeout: 5_000,
      });
    });

    test('switch to system theme', async ({ page }) => {
      await page.goto(ROUTES.settingsGeneral);
      await expect(page).toHaveURL(/settings\/general/);

      // Click system theme button
      await page.getByText(/systemowy/i).click();

      // Theme should be applied based on system preference — just verify no error
      await expect(page).toHaveURL(/settings\/general/);
    });
  });

  test.describe('Profile', () => {
    test('edit profile name', async ({ page }) => {
      await page.goto(ROUTES.settingsAccount);
      await expect(page).toHaveURL(/settings\/account/);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // Find the name input
      const nameInput = page.locator('#name');
      await expect(nameInput).toBeVisible({ timeout: 10_000 });

      // Clear and type a new name
      await nameInput.clear();
      await nameInput.fill('E2E Updated Name');

      // Save changes
      await page.getByText(/zapisz zmiany/i).click();

      // Should show success toast
      await expect(page.getByText(/profil zaktualizowany/i)).toBeVisible({
        timeout: 10_000,
      });

      // Restore original name
      await nameInput.clear();
      await nameInput.fill(TEST_USER_NAME);
      await page.getByText(/zapisz zmiany/i).click();
      await expect(page.getByText(/profil zaktualizowany/i)).toBeVisible({
        timeout: 10_000,
      });
    });

    test('profile save button is disabled when no changes', async ({
      page,
    }) => {
      await page.goto(ROUTES.settingsAccount);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // Save button should be disabled since nothing changed
      const saveButton = page.getByText(/zapisz zmiany/i);
      await expect(saveButton).toBeVisible({ timeout: 10_000 });
      await expect(saveButton).toBeDisabled();
    });

    test('email field is read-only', async ({ page }) => {
      await page.goto(ROUTES.settingsAccount);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      const emailInput = page.locator('#email');
      await expect(emailInput).toBeVisible({ timeout: 10_000 });
      await expect(emailInput).toBeDisabled();
    });
  });

  test.describe('Password', () => {
    test('password change form is visible', async ({ page }) => {
      await page.goto(ROUTES.settingsAccount);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      // Look for the security/password section
      const securityTab = page.getByText(/bezpieczeństwo/i);
      if (await securityTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await securityTab.click();
      }

      // Password fields should be visible
      await expect(page.locator('#currentPassword')).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator('#newPassword')).toBeVisible();
      await expect(page.locator('#confirmPassword')).toBeVisible();
    });

    test('password change validates matching passwords', async ({ page }) => {
      await page.goto(ROUTES.settingsAccount);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });

      const securityTab = page.getByText(/bezpieczeństwo/i);
      if (await securityTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await securityTab.click();
      }

      // Fill mismatched passwords
      await page.locator('#currentPassword').fill('OldPassword123!');
      await page.locator('#newPassword').fill('NewPassword123!');
      await page.locator('#confirmPassword').fill('DifferentPassword123!');

      // Submit
      await page.getByText(/zmień hasło/i).click();

      // Should show validation error about passwords not matching
      await expect(
        page.getByText(/hasła.*nie.*pasują|passwords.*match|nie zgadzają/i),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Language', () => {
    test('switch language from Polish to English and back', async ({
      page,
    }) => {
      await page.goto(ROUTES.settingsGeneral);
      await expect(page).toHaveURL(/\/pl\/settings\/general/);

      // Find the language switcher (flag button)
      const langSwitcher = page.locator(
        'button:has(.fi-pl), button:has(.fi-gb)',
      );

      if (
        !(await langSwitcher.isVisible({ timeout: 5_000 }).catch(() => false))
      ) {
        test.skip(true, 'Language switcher not visible on this page');
        return;
      }

      // Click to switch to English
      await langSwitcher.click();

      // URL should change to /en/
      await expect(page).toHaveURL(/\/en\//, { timeout: 10_000 });

      // Switch back to Polish
      const langSwitcherEn = page.locator(
        'button:has(.fi-pl), button:has(.fi-gb)',
      );
      await langSwitcherEn.click();

      // URL should be back to /pl/
      await expect(page).toHaveURL(/\/pl\//, { timeout: 10_000 });
    });
  });
});
