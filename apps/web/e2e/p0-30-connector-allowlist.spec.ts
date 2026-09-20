import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_ORG_ID } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

/**
 * The per-organization restriction over the connector catalogue.
 *
 * It is the one behaviour a platform administrator relies on when they add a
 * connector and grant it to two organizations out of fifty, and the one a
 * column rename could silently break — the allowlist is a `String[]` of slugs
 * compared against `McpConnector.providerSlug`, and both sides of that
 * comparison moved in
 * docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md.
 *
 * `p0-` on purpose. Only `smoke-*` and `p0-*` run on a pull request, and the
 * only connector spec before this one was `p1-33`, which does not gate the
 * pull request that breaks it. A regression here shows a customer a connector
 * their organization was never granted.
 */
async function withPrisma<T>(fn: (prisma: any) => Promise<T>): Promise<T> {
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** Permitted for this organization. */
const ALLOWED_SLUG = 'SLACK';
/** In the catalogue, enabled, and not on this organization's list. */
const WITHHELD_SLUG = 'CLICKUP';

let previousAllowed: string[] = [];

test.beforeAll(async () => {
  await withPrisma(async (prisma) => {
    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: TEST_ORG_ID },
      select: { allowedConnectors: true },
    });
    previousAllowed = settings?.allowedConnectors ?? [];

    await prisma.organizationSettings.upsert({
      where: { organizationId: TEST_ORG_ID },
      update: { allowedConnectors: [ALLOWED_SLUG] },
      create: {
        organizationId: TEST_ORG_ID,
        allowedConnectors: [ALLOWED_SLUG],
      },
    });
  });
});

test.afterAll(async () => {
  await withPrisma(async (prisma) => {
    await prisma.organizationSettings.update({
      where: { organizationId: TEST_ORG_ID },
      data: { allowedConnectors: previousAllowed },
    });
  });
});

test.describe('the connector allowlist', () => {
  test('shows a granted connector and withholds one that is not', async ({
    page,
  }) => {
    await page.goto(ROUTES.settingsConnectors);
    await expect(page).toHaveURL(/connectors/);

    await expect(
      page.getByRole('heading', { name: /integracje/i }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByText(/slack/i).first(),
      'the granted connector should be offered',
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByText(/clickup/i),
      'a connector this organization was not granted should not be offered',
    ).toHaveCount(0);
  });

  test('an entry disabled in the catalogue reaches nobody, granted or not', async ({
    page,
  }) => {
    // Disabling is the switch an operator has instead of a feature flag, and
    // it has to beat the allowlist: an entry that is off is off for the
    // organizations that were granted it too.
    await withPrisma(async (prisma) => {
      await prisma.organizationSettings.update({
        where: { organizationId: TEST_ORG_ID },
        data: { allowedConnectors: [ALLOWED_SLUG, WITHHELD_SLUG] },
      });
      await prisma.mcpCatalogEntry.update({
        where: { slug: WITHHELD_SLUG },
        data: { enabled: false },
      });
    });

    try {
      await page.goto(ROUTES.settingsConnectors);
      await expect(
        page.getByRole('heading', { name: /integracje/i }),
      ).toBeVisible({ timeout: 10_000 });

      await expect(page.getByText(/slack/i).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.getByText(/clickup/i),
        'a disabled catalogue entry is not offered even where it is granted',
      ).toHaveCount(0);
    } finally {
      await withPrisma(async (prisma) => {
        await prisma.mcpCatalogEntry.update({
          where: { slug: WITHHELD_SLUG },
          data: { enabled: true },
        });
        await prisma.organizationSettings.update({
          where: { organizationId: TEST_ORG_ID },
          data: { allowedConnectors: [ALLOWED_SLUG] },
        });
      });
    }
  });
});
