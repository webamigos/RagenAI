import { mkdir } from 'fs/promises';
import path from 'path';

import { expect, test as setup } from '@playwright/test';

import { AUTH_FILE, ROUTES } from './constants';
import { signIn } from './helpers';

setup('authenticate as the platform administrator', async ({ page }) => {
  await signIn(page);

  // The panel signs in with `window.location.href`, so this is a real
  // navigation. Landing anywhere outside /login means the dashboard layout's
  // role check passed — which is the assertion, not just a wait.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });
  await expect(page.getByRole('link', { name: 'Users' })).toBeVisible();

  await mkdir(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });

  // Leave the session on a known page so a spec that forgets to navigate
  // fails on its own assertion rather than on wherever setup happened to end.
  await page.goto(ROUTES.dashboard);
});
