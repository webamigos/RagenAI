import { expect, test } from '@playwright/test';

import { ADMIN_EMAIL, CUSTOMER_EMAIL, ROUTES } from './constants';

/**
 * Granting and revoking the platform role, and the guard on your own.
 *
 * Note what is *not* here. The last-administrator guard — the locking read
 * that stops two administrators demoting each other into a locked-out panel —
 * cannot be reached through this UI: the only way to be looking at the last
 * administrator is to be them, and the control refuses self-demotion before
 * the server is asked. That guard is covered where it is reachable, in
 * `users/__tests__/actions.test.ts`. Writing an e2e that claimed to exercise
 * it would be worse than not having one.
 */

async function openActions(
  page: import('@playwright/test').Page,
  email: string,
) {
  const row = page.locator('tr', { hasText: email }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: 'User actions' }).click();
}

test('a platform administrator cannot revoke their own role', async ({
  page,
}) => {
  await page.goto(ROUTES.users);
  await openActions(page, ADMIN_EMAIL);

  const revoke = page.getByRole('button', { name: 'Revoke platform admin' });
  await expect(revoke).toBeVisible();

  // Disabled, and it says why — the reader is told before clicking rather
  // than after the server refuses.
  await expect(revoke).toBeDisabled();
  await expect(revoke).toHaveAttribute(
    'title',
    /cannot remove your own platform-administrator role/i,
  );
});

test('the role can be granted to another account and taken back', async ({
  page,
}) => {
  await page.goto(ROUTES.users);

  // Assert on the row's Role cell rather than by reopening the menu. The
  // action revalidates the page, so the cell is the thing that actually
  // proves the write landed — and it does not depend on a menu having
  // re-hydrated before the next click.
  const roleCell = () =>
    page
      .locator('tr', { hasText: CUSTOMER_EMAIL })
      .first()
      .locator('td')
      .nth(2);

  await expect(roleCell()).toHaveText('user');

  await openActions(page, CUSTOMER_EMAIL);
  await page.getByRole('button', { name: 'Make platform admin' }).click();
  await expect(roleCell()).toHaveText('admin', { timeout: 15_000 });

  // Revoke — allowed, because this is not the last administrator and not self.
  await openActions(page, CUSTOMER_EMAIL);
  await page.getByRole('button', { name: 'Revoke platform admin' }).click();
  await expect(roleCell()).toHaveText('user', { timeout: 15_000 });
});

/**
 * Both halves of the round-trip above, each in its own bucket.
 *
 * This assertion could not be written until `AUTH_ADMIN_ROLE_REVOKED` existed:
 * a revocation was filed as `AUTH_ADMIN_ROLE_GRANTED`, so filtering the
 * incidents view — which filters on `eventType`, not on `metadata.action` —
 * for "who lost the platform role" returned the grants instead.
 *
 * It asserts the wiring end to end rather than that the action called a mock:
 * the panel rendered an Activity Log and wrote to it zero times before the
 * audit trail landed.
 */
for (const [half, eventType] of [
  ['granted', 'AUTH_ADMIN_ROLE_GRANTED'],
  ['revoked', 'AUTH_ADMIN_ROLE_REVOKED'],
] as const) {
  test(`the ${half} half is filed under its own event type`, async ({
    page,
  }) => {
    await page.goto(`${ROUTES.incidents}?eventType=${eventType}`);

    await expect(
      page.getByRole('heading', { name: 'Security Incidents' }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(eventType).first()).toBeVisible({
      timeout: 15_000,
    });
  });
}
