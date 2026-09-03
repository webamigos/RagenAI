import { expect, test, type Page } from '@playwright/test';

import { CUSTOMER_EMAIL, CUSTOMER_PASSWORD, ROUTES } from './constants';
import { signIn } from './helpers';

/**
 * The panel shares its `users` table with the customer application, so having
 * an account is not having access. `User.role` is the only thing separating
 * the two, and it is read from the database on every request.
 *
 * This is the test that matters most in the suite: everything else assumes
 * the wrong people cannot get in.
 *
 * One sign-in for all three assertions, deliberately. The panel limits
 * `/sign-in/email` to ten attempts per five minutes — a real protection, not
 * something to weaken for tests — and a file that signed in three times would
 * make the whole suite flaky on a re-run within that window.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signIn(page, CUSTOMER_EMAIL, CUSTOMER_PASSWORD);

  // Wait for the refusal itself. `waitForURL(/\/login/)` would resolve
  // immediately — the page is already there — and the assertions below would
  // then run before the session cookie exists.
  await page.waitForURL(/error=forbidden/, { timeout: 20_000 });
});

test.afterAll(async () => {
  await page.close();
});

test('an ordinary customer account cannot reach the panel', async () => {
  // The message, not just the URL: a wrong password lands on the same URL and
  // would let this pass while proving nothing about the role check.
  await expect(
    page.getByText('That account is not a platform administrator.'),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Users' })).toBeHidden();
});

test('the export endpoint refuses them even with a valid session', async () => {
  // They hold a session cookie, so `proxy.ts` lets the request through — the
  // route's own `getAdminUser()` check is what stops it. That is the guard
  // worth testing, and the reason the route carries one at all.
  const response = await page.request.get('/api/export/api-keys', {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(403);
});

test('and they cannot reach a page directly either', async () => {
  await page.goto(ROUTES.users);

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
});
