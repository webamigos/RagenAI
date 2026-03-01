import { test, expect } from '@playwright/test';

import { login, LABELS } from './helpers';

test('sign out success', async ({ page }) => {
  await login(page);

  await page.waitForTimeout(2000);

  await page.getByTestId('avatar-icon').last().click();
  await page.waitForTimeout(1000);
  await page.getByText(LABELS.signOut).click();

  await expect(page.getByRole('button', { name: LABELS.signIn })).toBeVisible();
});
