import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  TEST_ORG_ID,
  TEST_USER_ID,
  TEST_USER_NAME,
  TEST_FILE_ID,
  TEST_DOCUMENT_V2_ID,
} from './constants';

test('findings offer scoped actions, selected inferred relations, history groups and responsive layout', async ({
  page,
}) => {
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const ids = Array.from({ length: 4 }, () => randomUUID());
  const prefix = `Findings ${randomUUID()}`;
  const findingIds: string[] = [];
  try {
    for (const [index, publicId] of ids.entries()) {
      await db.knowledgePage.create({
        data: {
          organizationId: TEST_ORG_ID,
          publicId,
          title: `${prefix} ${index}`,
          slug: `findings-${publicId}`,
          type: 'POLICY',
          content: 'Synthetic finding fixture.',
          contentHash: `sha256:${'a'.repeat(64)}`,
          status: 'APPROVED',
          ownerId: index === 2 ? null : TEST_USER_ID,
          accessibleBy: [`org:${TEST_ORG_ID}`],
          ...(index < 2
            ? {
                sources: {
                  create: {
                    fileId: TEST_FILE_ID,
                    documentVersionId: TEST_DOCUMENT_V2_ID,
                    span: '§1',
                    quote: 'Synthetic quote',
                    hash: `sha256:${'b'.repeat(64)}`,
                  },
                },
              }
            : {}),
        },
      });
    }
    const pages = await db.knowledgePage.findMany({
      where: { organizationId: TEST_ORG_ID, publicId: { in: ids } },
      select: { id: true, publicId: true },
    });
    const internalId = (id: string) => pages.find((p) => p.publicId === id)!.id;
    for (const [type, publicId, status, minute] of [
      ['ORPHAN', ids[0], 'OPEN', 0],
      ['ORPHAN', ids[3], 'OPEN', 0],
      ['UNOWNED', ids[2], 'OPEN', 0],
      ['STALE', ids[1], 'RESOLVED', 1],
      ['STALE', ids[1], 'RESOLVED', 3],
    ] as const) {
      const finding = await db.knowledgeFinding.create({
        data: {
          organizationId: TEST_ORG_ID,
          type,
          status,
          pageIds: [internalId(publicId)],
          detectedAt: new Date(Date.UTC(2026, 9, 6, 12, minute)),
          detail: { fingerprint: `fixture-${publicId}` },
        },
      });
      findingIds.push(finding.publicId);
    }
    await page.goto('/pl/brain/findings?type=ORPHAN');
    const first = page.getByTestId('brain-finding-card').filter({
      has: page.getByRole('heading', { name: `${prefix} 0`, exact: true }),
    });
    await expect(first).toBeVisible();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`brain-phase6-open-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(
      first.getByRole('button', { name: 'Dodaj zaznaczone powiązania' }),
    ).toHaveCount(0);
    await first
      .getByRole('checkbox', { name: `${prefix} 1`, exact: true })
      .check();
    await first
      .getByRole('button', { name: 'Dodaj zaznaczone powiązania' })
      .click();
    await expect
      .poll(async () =>
        db.knowledgeEdge.count({
          where: {
            organizationId: TEST_ORG_ID,
            fromPageId: internalId(ids[0]),
            toPageId: internalId(ids[1]),
            origin: 'INFERRED',
          },
        }),
      )
      .toBe(1);
    const dismissed = page.getByTestId('brain-finding-card').filter({
      has: page.getByRole('heading', { name: `${prefix} 3`, exact: true }),
    });
    await dismissed
      .getByRole('button', { name: 'To w porządku, zamknij' })
      .click();
    await expect(dismissed).toHaveCount(0);
    await expect
      .poll(async () =>
        db.knowledgeFinding.count({
          where: {
            organizationId: TEST_ORG_ID,
            publicId: findingIds[1],
            status: 'DISMISSED',
          },
        }),
      )
      .toBe(1);
    await page.goto('/pl/brain/findings?type=UNOWNED');
    const owner = page.getByTestId('brain-finding-card').filter({
      has: page.getByRole('heading', { name: `${prefix} 2`, exact: true }),
    });
    await owner.getByRole('combobox').click();
    await page
      .getByRole('option', { name: TEST_USER_NAME, exact: true })
      .click();
    await owner.getByRole('button', { name: 'Zapisz właściciela' }).click();
    await expect
      .poll(
        async () =>
          (
            await db.knowledgePage.findFirstOrThrow({
              where: { organizationId: TEST_ORG_ID, publicId: ids[2] },
              select: { ownerId: true },
            })
          ).ownerId,
      )
      .toBe(TEST_USER_ID);
    await page.goto('/pl/brain/findings?status=RESOLVED&type=STALE');
    const batch = page
      .getByTestId('brain-finding-batch')
      .filter({ hasText: `${prefix} 1` });
    await expect(batch).toHaveCount(1);
    await expect(batch.locator('summary')).toContainText('2 × Nieaktualne');
    await batch.locator('summary').click();
    await expect(batch.getByTestId('brain-finding-card')).toHaveCount(2);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`brain-phase6-findings-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      `/pl/brain/graph?view=neighbourhood&focus=${ids[0]}&inferred=1`,
    );
    const graphCard = page.getByTestId('brain-graph-card');
    await expect(graphCard).toContainText(`${prefix} 0`);
    const canvas = page.getByTestId('brain-graph');
    const canvasBox = await canvas.boundingBox();
    const cardBox = await graphCard.boundingBox();
    expect(cardBox!.x).toBeGreaterThan(canvasBox!.x);
    await page.screenshot({
      path: test.info().outputPath('brain-phase6-graph-1440.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath('brain-phase6-graph-390.png'),
      fullPage: true,
    });
  } finally {
    await db.knowledgeFinding.deleteMany({
      where: { organizationId: TEST_ORG_ID, publicId: { in: findingIds } },
    });
    const fixturePages = await db.knowledgePage.findMany({
      where: { organizationId: TEST_ORG_ID, publicId: { in: ids } },
      select: { id: true },
    });
    const pageIds = fixturePages.map((page) => page.id);
    await db.knowledgeDecision.deleteMany({
      where: { organizationId: TEST_ORG_ID, pageId: { in: pageIds } },
    });
    await db.knowledgeEdge.deleteMany({
      where: {
        organizationId: TEST_ORG_ID,
        OR: [{ fromPageId: { in: pageIds } }, { toPageId: { in: pageIds } }],
      },
    });
    await db.knowledgePage.deleteMany({
      where: { organizationId: TEST_ORG_ID, publicId: { in: ids } },
    });
    await db.$disconnect();
  }
});
