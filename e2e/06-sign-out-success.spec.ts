import { test, expect } from '@playwright/test';

import { login, LABELS } from './helpers';

test('sign out success', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/pl\//, { timeout: 15_000 });

  await page.getByTestId('avatar-icon').last().click();
  await page.getByText(LABELS.signOut).click();

  await expect(page.getByRole('button', { name: LABELS.signIn })).toBeVisible({
    timeout: 10_000,
  });
});
