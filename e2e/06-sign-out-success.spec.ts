import { test, expect } from '@playwright/test';

import { login, LABELS } from './helpers';

test('sign out success', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/pl\//, { timeout: 15_000 });

  // Wait for the panel to fully load (avatar in sidebar)
  const avatar = page.getByTestId('avatar-icon').last();
  await expect(avatar).toBeVisible({ timeout: 15_000 });
  await avatar.click();

  await page.getByText(LABELS.signOut).click();

  await expect(page.getByRole('button', { name: LABELS.signIn })).toBeVisible({
    timeout: 10_000,
  });
});
