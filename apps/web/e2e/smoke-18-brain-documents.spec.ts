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
    await expect(
      page.getByRole('heading', { name: 'Źródła', exact: true }),
    ).toBeVisible();
    const rows = page.getByTestId('brain-document-row');
    const seeded = rows.filter({ hasText: TEST_FILE_NAME });
    await expect(seeded).toContainText(
      /\d+ zatwierdzon(?:a|e|ych) · \d+ (?:kandydat|kandydaci|kandydatów)/,
    );
    const empty = rows.filter({ hasText: names[0] });
    await expect(empty).toContainText('Nic nie wyodrębniono');
    await expect(empty).toContainText('Sprawdź język');
    await expect(
      empty.getByRole('button', { name: 'Ponów ekstrakcję' }),
    ).toBeVisible();
    const waiting = rows.filter({ hasText: names[1] });
    await expect(waiting).toContainText('Nie wyodrębniono jeszcze');
    await expect(waiting).toContainText('polski');
    await expect(
      waiting.getByRole('button', { name: 'Ponów ekstrakcję' }),
    ).toHaveCount(0);
    const maxPages = await rows.evaluateAll((elements) =>
      Math.max(
        1,
        ...elements.map((row) => {
          const text = row.textContent?.match(
            /(\d+) zatwierdzon(?:a|e|ych) · (\d+) (?:kandydat|kandydaci|kandydatów)/,
          );
          return text ? Number(text[1]) + Number(text[2]) : 0;
        }),
      ),
    );
    await expect(
      page.getByText(new RegExp(`Skala wspólna: ${maxPages} `)),
    ).toBeVisible();
    const rowCount = await rows.count();
    await expect(
      page.getByTestId('documents-summary-documents').locator('strong'),
    ).toHaveText(String(rowCount));
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
