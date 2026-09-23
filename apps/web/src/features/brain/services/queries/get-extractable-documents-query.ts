import db from '@ragenai/prisma-client';

import type { Prisma } from '@/generated/prisma/client';

import type { ExtractableDocument } from '../../contracts/brain-extraction.types';

/**
 * The files Brain can extract from, in one organization (spec D3).
 *
 * A file with a parsed document — found through the relation or the copy
 * column, for the reason D1 gives — that is neither an import (a thread's
 * copy of a knowledge-base file, which would be extracted twice) nor the
 * vehicle of a published page (Brain's own output, which must never become
 * its input). The start command asks the same `where`, so the dialog cannot
 * offer a file the command would refuse.
 */
export function extractableFilesWhere(
  orgId: string,
): Prisma.UserFileWhereInput {
  return {
    organizationId: orgId,
    sourceFileId: null,
    publishedPages: { none: {} },
    OR: [{ document: { isNot: null } }, { documentId: { not: null } }],
  };
}

export async function getExtractableDocumentsQuery(
  orgId: string,
): Promise<ExtractableDocument[]> {
  const files = await db.userFile.findMany({
    where: extractableFilesWhere(orgId),
    select: { id: true, fileName: true },
    orderBy: { fileName: 'asc' },
    take: 1000,
  });
  if (files.length === 0) {
    return [];
  }
  const cited = await db.knowledgePageSource.groupBy({
    by: ['fileId'],
    where: {
      organizationId: orgId,
      fileId: { in: files.map((f) => f.id) },
      page: { status: { not: 'REJECTED' } },
    },
    _count: { pageId: true },
  });
  const pages = new Map(cited.map((c) => [c.fileId, c._count.pageId]));
  return files.map((f) => ({
    fileId: f.id,
    fileName: f.fileName,
    pages: pages.get(f.id) ?? 0,
  }));
}
