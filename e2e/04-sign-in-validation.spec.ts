import { test, expect } from '@playwright/test';

import { ROUTES, LABELS } from './helpers';

test('sign in validation', async ({ page }) => {
  await page.goto(ROUTES.home);
  await page.getByRole('button', { name: LABELS.signIn }).click();

  await page.waitForURL('**/sign-in');

  await page.getByRole('button', { name: LABELS.signIn }).click();

  await expect(page.getByText(LABELS.emailInvalid)).toBeVisible();
  await expect(page.getByText(LABELS.passwordTooShort)).toBeVisible();
});
