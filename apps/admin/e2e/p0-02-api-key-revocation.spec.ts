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

test('revoking without a reachable vault keeps the key and explains why', async ({
  page,
}) => {
  await page.goto(`${ROUTES.apiKeys}?search=${KEY_NAME}`);

  const row = page.locator('tr', { hasText: KEY_NAME }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });

  await row.getByRole('button', { name: 'Revoke' }).click();
  await expect(
    page.getByText(/Permanent\. The secret is destroyed/i),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Destroy secret' }).click();

  // Either message is a pass: the vault may be unconfigured here, or
  // configured and unreachable. Both must leave the key in place.
  // Not `getByRole('alert')`: Next renders an empty `role="alert"` route
  // announcer on every page, and it matches first.
  //
  // Either wording is a pass. The vault may be unconfigured here, or
  // configured and unreachable — both must leave the key in place, and the
  // panel says which happened.
  await expect(
    page.getByText(
      /(needs RAGEN_TOKEN_VAULT_URL|its secret is still in the vault)/i,
    ),
  ).toBeVisible({ timeout: 20_000 });

  await page.reload();
  const rowAfter = page.locator('tr', { hasText: KEY_NAME }).first();
  await expect(rowAfter, 'the key must survive a failed revoke').toBeVisible({
    timeout: 15_000,
  });

  // Deactivated but not deleted: dead at the guard, and still holding the
  // only handle on the secret that could not be removed.
  await expect(rowAfter.getByText('deactivated')).toBeVisible();
});
