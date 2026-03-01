import { mkdir } from 'fs/promises';
import path from 'path';
import { test as setup, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { login, LABELS } from './helpers';

setup('authenticate', async ({ page }) => {
  await login(page);
  await expect(page.getByText(LABELS.newThread)).toBeVisible();
  await mkdir(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
