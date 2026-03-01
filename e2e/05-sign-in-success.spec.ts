import { test, expect } from '@playwright/test';

import { login, LABELS } from './helpers';

test('sign in success', async ({ page }) => {
  await login(page);
  await expect(page.getByText(LABELS.newThread)).toBeVisible();
});
