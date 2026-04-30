import db from '@ragenai/prisma-client';
import type { TopCitedDocument } from '@/features/documents/contracts/knowledge-analytics.types';

export async function getTopCitedDocumentsQuery(
  orgId: string,
): Promise<TopCitedDocument[]> {
  const groups = await db.documentCitation.groupBy({
    by: ['fileId'],
    where: { orgId },
    _count: { fileId: true },
    orderBy: { _count: { fileId: 'desc' } },
    take: 10,
  });

  if (groups.length === 0) {
    return [];
  }

  const fileIds = groups.map((g) => g.fileId);

  const files = await db.userFile.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, fileName: true },
  });

  const fileMap = new Map(files.map((f) => [f.id, f]));

  return groups
    .map((g) => {
      const file = fileMap.get(g.fileId);
      if (!file) {
        return null;
      }
      return {
        fileId: file.id,
        publicId: file.id, // UserFile has no separate publicId
        fileName: file.fileName,
        citationCount: g._count.fileId,
      };
    })
    .filter((item): item is TopCitedDocument => item !== null);
}
