import { expect, test } from '@playwright/test';
import {
  TEST_BRAIN_PAGE_TITLE,
  TEST_BRAIN_PAGE_PUBLIC_ID,
  TEST_BRAIN_ASSISTANT_PAGE_PUBLIC_ID,
  TEST_BRAIN_ASSISTANT_PAGE_TITLE,
  TEST_ORG_ID,
} from './constants';
import { randomUUID } from 'node:crypto';
test('opens topics by default, finds a page neighbourhood and preserves the full graph', async ({
  page,
}) => {
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const kind = `graph-view-smoke-${randomUUID()}`;
  try {
    const first = await db.knowledgePage.findFirstOrThrow({
      where: {
        organizationId: TEST_ORG_ID,
        publicId: TEST_BRAIN_PAGE_PUBLIC_ID,
      },
      select: { id: true },
    });
    const second = await db.knowledgePage.findFirstOrThrow({
      where: {
        organizationId: TEST_ORG_ID,
        publicId: TEST_BRAIN_ASSISTANT_PAGE_PUBLIC_ID,
      },
      select: { id: true },
    });
    await db.knowledgeEdge.create({
      data: {
        organizationId: TEST_ORG_ID,
        fromPageId: first.id,
        toPageId: second.id,
        kind,
        origin: 'EXTRACTED',
      },
    });
    await page.goto('/pl/brain/graph');
    await expect(
      page.getByRole('link', { name: 'Tematy', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('brain-topic-map')).toBeVisible();
    await page.getByTestId('brain-topic').first().click();
    await expect(page.getByTestId('brain-topic-members')).toContainText(
      TEST_BRAIN_PAGE_TITLE,
    );
    await expect(page.getByTestId('brain-topic-members')).toContainText(
      TEST_BRAIN_ASSISTANT_PAGE_TITLE,
    );
    await page
      .getByRole('searchbox', {
        name: 'Znajdź stronę, aby zobaczyć jej sąsiedztwo',
      })
      .fill(TEST_BRAIN_PAGE_TITLE);
    await page
      .getByRole('search')
      .getByRole('link', { name: TEST_BRAIN_PAGE_TITLE, exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: 'Sąsiedztwo strony', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('brain-graph-card')).toContainText(
      TEST_BRAIN_PAGE_TITLE,
    );
    await expect(
      page.getByTestId('brain-graph').locator('canvas').first(),
    ).toBeAttached();
    await page.getByRole('link', { name: 'Tematy', exact: true }).click();
    const isolated = page.getByRole('link', {
      name: 'Przejrzyj strony bez powiązań',
    });
    await expect(isolated).toBeVisible();
    await isolated.click();
    await expect(page.getByTestId('brain-topic-members')).toContainText(
      'Strony bez powiązań',
    );
    await page.getByRole('link', { name: 'Pełny graf', exact: true }).click();
    await expect(page.getByTestId('brain-graph-count')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: 'Tematy', exact: true }).click();
    await expect(page.getByTestId('brain-topic-map')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await db.knowledgeEdge.deleteMany({
      where: { organizationId: TEST_ORG_ID, kind },
    });
    await db.$disconnect();
  }
});
