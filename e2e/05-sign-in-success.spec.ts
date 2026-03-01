import { test, expect } from '@playwright/test';

import { login } from './helpers';

test('sign in success', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/pl\//, { timeout: 15_000 });
});
