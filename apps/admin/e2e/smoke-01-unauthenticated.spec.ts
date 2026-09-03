import { expect, test } from '@playwright/test';

import { ROUTES } from './constants';

/**
 * Every page refuses an anonymous visitor.
 *
 * Parameterised over the whole sidebar rather than spot-checking one route:
 * access is enforced by the dashboard *layout*, so a page added outside that
 * layout — or one that opts out of it — would be open with nothing else
 * noticing.
 */

const PROTECTED = Object.entries(ROUTES).filter(
  ([name]) => name !== 'login',
) as [string, string][];

test.describe('unauthenticated access', () => {
  for (const [name, path] of PROTECTED) {
    test(`${name} redirects to the sign-in page`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
      await expect(page.locator('input[type="password"]')).toBeVisible();
    });
  }
});

test('the CSV export endpoint refuses too', async ({ page }) => {
  // `maxRedirects: 0` matters: by default this follows the redirect and
  // reports the login page's 200, which reads as "the export succeeded".
  const response = await page.request.get('/api/export/activity-log', {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(307);
  expect(response.headers()['location']).toContain('/login');
});
