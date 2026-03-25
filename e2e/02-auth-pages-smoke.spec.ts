import { test, expect } from '@playwright/test';

import { ROUTES } from './helpers';

test.describe('Auth pages smoke tests', () => {
  test('forgot-password page loads', async ({ page }) => {
    await page.goto(ROUTES.forgotPassword);
    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.getByText(/zapomniałeś hasła/i)).toBeVisible();
  });
});
