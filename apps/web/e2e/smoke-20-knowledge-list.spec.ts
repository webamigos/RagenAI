import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { TEST_ORG_ID, TEST_USER_ID } from './constants';

test('knowledge list shows live coverage, honest quality and guarded optimization with portable responsive artifacts', async ({
  page,
}) => {
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const fileIds = [randomUUID(), randomUUID()];
  const pageIds: number[] = [];
  const documents: string[] = [];
  const names = fileIds.map((id, i) => `knowledge-list-${i}-${id}.docx`);
  try {
    for (const [index, id] of fileIds.entries()) {
      const file = await db.userFile.create({
        data: {
          id,
          organizationId: TEST_ORG_ID,
          ownerId: TEST_USER_ID,
          isUploaded: true,
          fileName: names[index],
          fileSize: 1024,
          fileType: 'DOCX',
          embeddingStatus: 'COMPLETED',
          parsingStatus: 'COMPLETED',
          language: 'pol',
          metadata:
            index === 0
              ? {
                  diagnostics: {
                    version: 1,
                    computedAt: new Date().toISOString(),
                    findings: [
                      { check: 'table-without-header', severity: 'warn' },
                    ],
                    stats: {
                      chunkCount: 10,
                      tableChunkCount: 1,
                      medianChunkChars: 700,
                      sectionPathShare: null,
                      overlapShare: 0,
                    },
                  },
                }
              : {},
          document: {
            create: {
              organizationId: TEST_ORG_ID,
              title: names[index],
              content: 'Synthetic source text.',
            },
          },
        },
        select: { document: { select: { id: true } } },
      });
      documents.push(file.document!.id);
    }
    const version = await db.documentVersion.create({
      data: {
        organizationId: TEST_ORG_ID,
        documentId: documents[0],
        versionNumber: 1,
        content: 'Synthetic source text.',
        title: names[0],
        changeType: 'UPLOAD',
        isActive: true,
      },
    });
    for (const status of ['APPROVED', 'CANDIDATE'] as const) {
      const knowledge = await db.knowledgePage.create({
        data: {
          organizationId: TEST_ORG_ID,
          title: `Coverage ${randomUUID()}`,
          slug: `coverage-${randomUUID()}`,
          type: 'POLICY',
          content: 'Synthetic knowledge.',
          contentHash: `sha256:${'a'.repeat(64)}`,
          status,
          ownerId: TEST_USER_ID,
          accessibleBy: [`org:${TEST_ORG_ID}`],
        },
      });
      pageIds.push(knowledge.id);
      for (const quote of ['first quote', 'second quote']) {
        await db.knowledgePageSource.create({
          data: {
            organizationId: TEST_ORG_ID,
            pageId: knowledge.id,
            documentVersionId: version.id,
            fileId: fileIds[0],
            quote,
            span: quote,
            hash: `sha256:${'b'.repeat(64)}`,
          },
        });
      }
    }
    await page.addInitScript(() =>
      localStorage.setItem('ragen:files-view-mode', 'grid'),
    );
    await page.goto('/pl/knowledge/documents-list');
    const first = page.getByTestId(`file-row-${fileIds[0]}`);
    await expect(first).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: 'Wiedza w Brain' }),
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: 'Jakość dla czatu' }),
    ).toBeVisible();
    await expect(first.getByTestId('file-brain-coverage')).toHaveText(
      '1 zatwierdzona · 1 do sprawdzenia',
    );
    await expect(first.getByLabel('Język pliku: polski')).toHaveText('PL');
    const second = page.getByTestId(`file-row-${fileIds[1]}`);
    await expect(second).toContainText('Brak wiedzy');
    await expect(second).toContainText('Nie sprawdzono');
    await expect(page.getByTestId('knowledge-list-issues')).toBeVisible();
    let requests = 0;
    await page.route(
      `**/api/documents/${documents[0]}/optimize-suggestions`,
      async (route) => {
        requests++;
        expect(route.request().method()).toBe('POST');
        await route.fulfill({ status: 200, json: { jobId: 'synthetic-job' } });
      },
    );
    await first
      .getByRole('button', { name: 'Optymalizuj', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Obsługiwane dokumenty: 1');
    expect(requests).toBe(0);
    await dialog.getByRole('button', { name: 'Przygotuj sugestie' }).click();
    await expect(dialog.getByRole('status')).toContainText(
      'Uruchomione: 1. Nieudane: 0.',
    );
    expect(requests).toBe(1);
    await expect(
      dialog.getByRole('link', { name: 'Przejrzyj sugestie' }),
    ).toHaveAttribute(
      'href',
      `/pl/knowledge/documents/${documents[0]}?tab=optimize`,
    );
    await dialog.getByRole('button', { name: 'Zamknij' }).click();
    await first.getByRole('checkbox').check();
    await expect(page.getByTestId('bulk-optimize')).toBeVisible();
    await page.getByTestId('bulk-optimize').click();
    await expect(dialog).toContainText(names[0]);
    await dialog.getByRole('button', { name: 'Zamknij' }).click();
    await page.getByTestId('bulk-clear').click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      const searchBox = await page
        .getByTestId('files-toolbar-search')
        .boundingBox();
      expect(searchBox?.x).toBeGreaterThanOrEqual(0);
      await page.screenshot({
        path: test.info().outputPath(`knowledge-list-${width}.png`),
        fullPage: true,
      });
    }
  } finally {
    await db.knowledgePage.deleteMany({
      where: { organizationId: TEST_ORG_ID, id: { in: pageIds } },
    });
    await db.userFile.deleteMany({
      where: { organizationId: TEST_ORG_ID, id: { in: fileIds } },
    });
    await db.userDocument.deleteMany({
      where: { organizationId: TEST_ORG_ID, id: { in: documents } },
    });
    await db.$disconnect();
  }
});
