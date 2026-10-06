import db from '@ragenai/prisma-client';

import type { BrainDocument } from '../../contracts/brain-documents.types';
import type { BrainLanguage } from '../../contracts/brain-language.types';
import { extractableFilesInLanguage } from './brain-language-scope';

/**
 * The organization's documents as Brain sees them (spec E9): each with how
 * many approved and candidate pages cite it and whether it is still in
 * retrieval. The approved count is what the "take out of retrieval" action
 * waits for: a document whose knowledge lives in approved pages can leave
 * the index without anything becoming unanswerable.
 */
export async function getBrainDocumentsQuery(
  orgId: string,
  language: BrainLanguage | null = null,
  emptyOnly = false,
): Promise<BrainDocument[]> {
  const cited = emptyOnly
    ? await db.knowledgePageSource.findMany({
        where: { organizationId: orgId },
        distinct: ['fileId'],
        select: { fileId: true },
      })
    : [];
  const files = await db.userFile.findMany({
    where: {
      ...extractableFilesInLanguage(orgId, language),
      ...(emptyOnly
        ? { id: { notIn: cited.map((source) => source.fileId) } }
        : {}),
    },
    select: {
      id: true,
      fileName: true,
      embeddingStatus: true,
      createdAt: true,
      language: true,
    },
    orderBy: { fileName: 'asc' },
  });
  if (files.length === 0) {
    return [];
  }
  const fileIds = files.map((f) => f.id);
  const [approved, candidates] = await Promise.all(
    (['APPROVED', 'CANDIDATE'] as const).map((status) =>
      db.knowledgePageSource.groupBy({
        by: ['fileId', 'pageId'],
        where: {
          organizationId: orgId,
          fileId: { in: fileIds },
          page: { status },
        },
      }),
    ),
  );
  // A page has one source row per quote. Grouping the file/page pair makes
  // each page count once per file, including pages citing several files.
  const count = (rows: { fileId: string; pageId: number }[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.fileId, (counts.get(row.fileId) ?? 0) + 1);
    }
    return counts;
  };
  const approvedBy = count(approved!);
  const candidatesBy = count(candidates!);
  return files.map((f) => ({
    fileId: f.id,
    fileName: f.fileName,
    approvedPages: approvedBy.get(f.id) ?? 0,
    candidatePages: candidatesBy.get(f.id) ?? 0,
    retrieval: retrievalState(f.embeddingStatus),
    uploadedAt: f.createdAt?.toISOString() ?? null,
    language: f.language,
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
