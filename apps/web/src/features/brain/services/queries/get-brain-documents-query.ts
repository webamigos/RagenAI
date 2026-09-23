import db from '@ragenai/prisma-client';

import type { BrainDocument } from '../../contracts/brain-documents.types';
import { extractableFilesWhere } from './get-extractable-documents-query';

/**
 * The organization's documents as Brain sees them (spec E9): each with how
 * many approved and candidate pages cite it and whether it is still in
 * retrieval. The approved count is what the "take out of retrieval" action
 * waits for: a document whose knowledge lives in approved pages can leave
 * the index without anything becoming unanswerable.
 */
export async function getBrainDocumentsQuery(
  orgId: string,
): Promise<BrainDocument[]> {
  const files = await db.userFile.findMany({
    where: extractableFilesWhere(orgId),
    select: { id: true, fileName: true, embeddingStatus: true },
    orderBy: { fileName: 'asc' },
    take: 1000,
  });
  if (files.length === 0) {
    return [];
  }
  const fileIds = files.map((f) => f.id);
  const [approved, candidates] = await Promise.all(
    (['APPROVED', 'CANDIDATE'] as const).map((status) =>
      db.knowledgePageSource.groupBy({
        by: ['fileId'],
        where: {
          organizationId: orgId,
          fileId: { in: fileIds },
          page: { status },
        },
        _count: { pageId: true },
      }),
    ),
  );
  const count = (rows: { fileId: string; _count: { pageId: number } }[]) =>
    new Map(rows.map((r) => [r.fileId, r._count.pageId]));
  const approvedBy = count(approved!);
  const candidatesBy = count(candidates!);
  return files.map((f) => ({
    fileId: f.id,
    fileName: f.fileName,
    approvedPages: approvedBy.get(f.id) ?? 0,
    candidatePages: candidatesBy.get(f.id) ?? 0,
    retrieval: retrievalState(f.embeddingStatus),
  }));
}

function retrievalState(status: string): BrainDocument['retrieval'] {
  if (status === 'COMPLETED') {
    return 'in';
  }
  if (status === 'WITHDRAWN') {
    return 'withdrawn';
  }
  if (status === 'STAGED') {
    return 'staged';
  }
  if (status === 'FAILED' || status === 'CANCELLED') {
    return 'failed';
  }
  return 'processing';
}
