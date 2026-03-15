import { test, expect } from '@playwright/test';

import { login, LABELS } from './helpers';

test('sign out success', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/pl\/new/, { timeout: 15_000 });

  // Wait for the panel to fully load (user menu in sidebar)
  const userMenu = page.getByTestId('user-menu').first();
  await expect(userMenu).toBeVisible({ timeout: 15_000 });
  await userMenu.click();

  await page.getByText(LABELS.signOut).click();

  await expect(page.getByTestId('sign-in-submit')).toBeVisible({
    timeout: 10_000,
  });
});
