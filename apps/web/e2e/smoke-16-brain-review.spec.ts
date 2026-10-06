import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { TEST_ORG_ID, TEST_USER_NAME } from './constants';

test('reviews five candidates by keyboard after assigning the document owner once', async ({
  page,
}) => {
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const fileId = randomUUID();
  const publicIds: string[] = [];
  try {
    await prisma.userFile.create({
      data: {
        id: fileId,
        organizationId: TEST_ORG_ID,
        fileName: 'Review keyboard.pdf',
        fileSize: 100,
        fileType: 'PDF',
        embeddingStatus: 'COMPLETED',
        isOrgWide: true,
        language: 'pol',
      },
    });
    const sourceDocument = await prisma.userDocument.create({
      data: {
        organizationId: TEST_ORG_ID,
        fileId,
        title: 'Review keyboard',
        content: '26 dni urlopu.',
      },
    });
    const version = await prisma.documentVersion.create({
      data: {
        organizationId: TEST_ORG_ID,
        documentId: sourceDocument.id,
        versionNumber: 1,
        title: 'Review keyboard',
        content: '26 dni urlopu.',
        changeType: 'UPLOAD',
        isActive: true,
      },
    });
    for (let i = 1; i <= 5; i++) {
      const publicId = randomUUID();
      publicIds.push(publicId);
      await prisma.knowledgePage.create({
        data: {
          organizationId: TEST_ORG_ID,
          publicId,
          title: `Review keyboard ${i}`,
          slug: `review-keyboard-${publicId}`,
          type: 'POLICY',
          content: `# Review keyboard ${i}\n\n- 26 dni urlopu [1]\n\n---\n\n1. 26 dni urlopu.`,
          contentHash: `sha256:${'a'.repeat(64)}`,
          accessibleBy: [`org:${TEST_ORG_ID}`],
          sources: {
            create: {
              fileId,
              documentVersionId: version.id,
              span: '§1',
              quote: '26 dni urlopu.',
              hash: `sha256:${'b'.repeat(64)}`,
            },
          },
        },
      });
    }
    await page.goto(`/pl/brain/review?page=${publicIds[0]}`);
    await expect(page.getByTestId('review-page-title')).toHaveText(
      'Review keyboard 1',
    );
    const checkbox = page.getByRole('checkbox', {
      name: 'Ustaw dla wszystkich 5 kandydatów z tego dokumentu',
    });
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    const owner = page.getByTestId('review-owner-picker').getByRole('combobox');
    await owner.focus();
    await page.keyboard.press('ArrowDown');
    await page
      .getByRole('option', { name: TEST_USER_NAME, exact: true })
      .waitFor();
    await page.keyboard.type(TEST_USER_NAME);
    await page.keyboard.press('Enter');
    const save = page.getByRole('button', {
      name: 'Przypisz właściciela kandydatom',
    });
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Zatwierdź i opublikuj', exact: true }),
    ).toBeEnabled();
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByTestId('review-page-title')).toHaveText(
        `Review keyboard ${i}`,
      );
      await page.getByTestId('review-page-title').focus();
      await page.keyboard.press('a');
      await expect(page.getByTestId('review-page-title')).not.toHaveText(
        `Review keyboard ${i}`,
      );
    }
    const reviewed = await prisma.knowledgePage.findMany({
      where: { organizationId: TEST_ORG_ID, publicId: { in: publicIds } },
      select: {
        status: true,
        publishedAt: true,
        decisions: {
          where: { organizationId: TEST_ORG_ID, action: 'SET_OWNER' },
          select: { id: true },
        },
      },
    });
    expect(reviewed).toHaveLength(5);
    for (const result of reviewed) {
      expect(result.status).toBe('APPROVED');
      expect(result.publishedAt).not.toBeNull();
      expect(result.decisions).toHaveLength(1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pl/brain/review');
    await expect(page.getByTestId('brain-review-mode')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    const pages = await prisma.knowledgePage.findMany({
      where: { organizationId: TEST_ORG_ID, publicId: { in: publicIds } },
      select: { id: true, publishedFileId: true },
    });
    const publishedFiles = pages.flatMap((item) =>
      item.publishedFileId ? [item.publishedFileId] : [],
    );
    // Delete only this test's synthetic ledger before its pages: real
    // review history intentionally prevents deleting a page.
    await prisma.knowledgeDecision.deleteMany({
      where: {
        organizationId: TEST_ORG_ID,
        pageId: { in: pages.map((item) => item.id) },
      },
    });
    await prisma.knowledgePage.deleteMany({
      where: { organizationId: TEST_ORG_ID, publicId: { in: publicIds } },
    });
    await prisma.userDocument.deleteMany({
      where: {
        organizationId: TEST_ORG_ID,
        fileId: { in: [fileId, ...publishedFiles] },
      },
    });
    await prisma.userFile.deleteMany({
      where: {
        organizationId: TEST_ORG_ID,
        id: { in: [fileId, ...publishedFiles] },
      },
    });
    await prisma.$disconnect();
  }
});
