import db from '@ragenai/prisma-client';
import type { UnusedDocument } from '@/features/documents/contracts/knowledge-analytics.types';

const UNUSED_THRESHOLD_DAYS = 90;

export async function getUnusedDocumentsQuery(
  orgId: string,
): Promise<UnusedDocument[]> {
  const threshold = new Date(
    Date.now() - UNUSED_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
  );

  const files = await db.userFile.findMany({
    where: {
      organizationId: orgId,
      embeddingStatus: 'COMPLETED',
      documentCitations: {
        none: {
          createdAt: { gte: threshold },
        },
      },
    },
    select: {
      id: true,
      fileName: true,
      createdAt: true,
      documentCitations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  const now = Date.now();

  return files.map((file) => {
    const lastCitation = file.documentCitations[0]?.createdAt ?? null;
    const referenceDate = lastCitation ?? file.createdAt ?? new Date(0);
    const daysSinceUsed = Math.floor(
      (now - referenceDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      fileId: file.id,
      publicId: file.id,
      fileName: file.fileName,
      lastCitedAt: lastCitation,
      daysSinceUsed,
    };
  });
}
