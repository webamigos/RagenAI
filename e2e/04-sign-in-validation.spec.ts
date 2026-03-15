import { test, expect } from '@playwright/test';

import { ROUTES, LABELS } from './helpers';

test('sign in validation', async ({ page }) => {
  await page.goto(ROUTES.signIn);

  await page.getByTestId('sign-in-submit').click();

  await expect(page.getByText(LABELS.emailInvalid)).toBeVisible();
  await expect(page.getByText(LABELS.passwordTooShort)).toBeVisible();
});
