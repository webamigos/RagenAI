import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { TEST_ORG_ID, TEST_FILE_NAME } from './constants';

test('shows distinct coverage, confirmed empty extraction, waiting and language states without page overflow', async ({
  page,
}) => {
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const fileIds = [randomUUID(), randomUUID()];
  const names = fileIds.map(
    (id, index) => `documents-smoke-${index}-${id}.xlsx`,
  );
  try {
    for (const [index, id] of fileIds.entries()) {
      await db.userFile.create({
        data: {
          id,
          organizationId: TEST_ORG_ID,
          fileName: names[index],
          fileSize: 100,
          embeddingStatus: 'COMPLETED',
          language: index === 0 ? null : 'pol',
          document: {
            create: {
              organizationId: TEST_ORG_ID,
              title: names[index],
              content: 'Synthetic extraction fixture.',
            },
          },
        },
      });
    }
    await db.knowledgeFinding.create({
      data: {
        organizationId: TEST_ORG_ID,
        fileId: fileIds[0],
        type: 'EXTRACTION_FAILED',
        pageIds: [],
        detail: { reason: 'nothing_extracted' },
      },
    });
    await page.goto('/pl/brain/documents');
    // The tab names the screen; it has no heading of its own.
    await expect(
      page.getByRole('link', { name: 'Źródła', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    const rows = page.getByTestId('brain-document-row');
    const seeded = rows.filter({ hasText: TEST_FILE_NAME });
    await expect(seeded).toContainText(
      /\d+ zatwierdzon(?:a|e|ych) · \d+ do sprawdzenia/,
    );
    const empty = rows.filter({ hasText: names[0] });
    await expect(empty).toContainText('Nic nie wyodrębniono');
    await expect(empty).toContainText('Sprawdź język');
    // Row actions sit behind the row's "⋯" menu.
    await empty.getByRole('button', { name: /^Działania: / }).click();
    await expect(
      page.getByRole('menuitem', { name: 'Ponów ekstrakcję' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    const waiting = rows.filter({ hasText: names[1] });
    await expect(waiting).toContainText('Nie wyodrębniono jeszcze');
    await expect(waiting).toContainText('polski');
    // Nothing to retry and nothing to take out of search: no menu at all.
    await expect(
      waiting.getByRole('button', { name: /^Działania: / }),
    ).toHaveCount(0);
    const maxPages = await rows.evaluateAll((elements) =>
      Math.max(
        1,
        ...elements.map((row) => {
          const text = row.textContent?.match(
            /(\d+) zatwierdzon(?:a|e|ych) · (\d+) do sprawdzenia/,
          );
          return text ? Number(text[1]) + Number(text[2]) : 0;
        }),
      ),
    );
    await expect(
      page.getByText(new RegExp(`Skala wspólna: ${maxPages} `)),
    ).toBeVisible();
    const rowCount = await rows.count();
    await expect(page.getByTestId('brain-documents-count')).toContainText(
      `(${rowCount})`,
    );
    await page.goto('/pl/brain/documents?lang=none&coverage=empty');
    await expect(rows.filter({ hasText: names[0] })).toHaveCount(1);
    await expect(rows.filter({ hasText: names[1] })).toHaveCount(0);
    await page.getByRole('link', { name: 'Pokaż wszystkie dokumenty' }).click();
    await expect(page).toHaveURL(/lang=none/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pl/brain/documents');
    await expect(page.getByTestId('brain-documents-panel')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await db.knowledgeFinding.deleteMany({
      where: { organizationId: TEST_ORG_ID, fileId: { in: fileIds } },
    });
    await db.userDocument.deleteMany({
      where: { organizationId: TEST_ORG_ID, fileId: { in: fileIds } },
    });
    await db.userFile.deleteMany({
      where: { organizationId: TEST_ORG_ID, id: { in: fileIds } },
    });
    await db.$disconnect();
  }
});
