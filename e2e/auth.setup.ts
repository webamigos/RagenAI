import { mkdir } from 'fs/promises';
import path from 'path';
import { test as setup, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { login } from './helpers';

setup('authenticate', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/pl\//, { timeout: 15_000 });
  await mkdir(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
