import { expect, test } from '@playwright/test';

import { ROUTES, TEST_ORG_ID } from './constants';

/**
 * Deactivating and revoking an API key.
 *
 * The interesting assertion is the refusal. Revoking destroys the secret in
 * ragen-token-vault, and the vault is not running in this environment — so
 * this proves the panel leaves the key alone and says so, rather than
 * deleting the row and orphaning a secret it could not remove. That ordering
 * is the whole design, and it is the opposite of what apps/web's own delete
 * does.
 */

const KEY_NAME = 'e2e-revocable-key';

test.beforeAll(async () => {
  const { PrismaClient } =
    await import('../../web/src/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    await prisma.apiKey.deleteMany({ where: { name: KEY_NAME } });
    await prisma.apiKey.create({
      data: {
        name: KEY_NAME,
        maskedValue: 'sk-e2e0...beef',
        organizationId: TEST_ORG_ID,
        isActive: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test('a key can be deactivated and reactivated', async ({ page }) => {
  await page.goto(`${ROUTES.apiKeys}?search=${KEY_NAME}`);

  const row = page.locator('tr', { hasText: KEY_NAME }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText('active', { exact: true })).toBeVisible();

  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expect(
    page.locator('tr', { hasText: KEY_NAME }).first().getByText('deactivated'),
  ).toBeVisible({ timeout: 15_000 });

  await page
    .locator('tr', { hasText: KEY_NAME })
    .first()
    .getByRole('button', { name: 'Reactivate' })
    .click();
  await expect(
    page
      .locator('tr', { hasText: KEY_NAME })
      .first()
      .getByText('active', { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});

test('a revoke that cannot destroy the secret leaves the key alone', async ({
  page,
}) => {
  await page.goto(`${ROUTES.apiKeys}?search=${KEY_NAME}`);

  const row = page.locator('tr', { hasText: KEY_NAME }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });

  const revoke = row.getByRole('button', { name: 'Revoke' });

  // Two environments, two correct behaviours, and the test has to know the
  // difference rather than assume one. The secret lives in the token vault,
  // so with no vault configured the control is disabled up front; with one
  // configured but unreachable the attempt is made and fails. CI runs the
  // first case, a developer machine reading the repository's own `.env.local`
  // runs the second — asserting only one of them made this pass locally and
  // fail on CI.
  if (await revoke.isDisabled()) {
    await expect(revoke).toHaveAttribute(
      'title',
      /needs the token vault configured/i,
    );
  } else {
    await revoke.click();
    await expect(
      page.getByText(/Permanent\. The secret is destroyed/i),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Destroy secret' }).click();

    // Not `getByRole('alert')`: Next renders an empty `role="alert"` route
    // announcer on every page, and it matches first.
    await expect(
      page.getByText(/its secret is still in the vault/i),
    ).toBeVisible({ timeout: 20_000 });
  }

  // The assertion both branches share, and the reason this test exists: the
  // row survives. Deleting it would lose the only handle on a secret that
  // was not removed.
  await page.reload();
  const rowAfter = page.locator('tr', { hasText: KEY_NAME }).first();
  await expect(rowAfter, 'the key must survive a failed revoke').toBeVisible({
    timeout: 15_000,
  });
});
