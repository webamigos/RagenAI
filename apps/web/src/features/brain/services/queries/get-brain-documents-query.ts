import db from '@ragenai/prisma-client';

import type { BrainDocument } from '../../contracts/brain-documents.types';
import type { BrainLanguage } from '../../contracts/brain-language.types';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
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
  const pairs = await pairsOf(orgId, fileIds);
  const sourceFileIds = [
    ...new Set([...fileIds, ...pairs.map((pair) => pair.counterpartId)]),
  ];
  const [approved, candidates] = await Promise.all(
    (['APPROVED', 'CANDIDATE'] as const).map((status) =>
      db.knowledgePageSource.groupBy({
        by: ['fileId', 'pageId'],
        where: {
          organizationId: orgId,
          fileId: { in: sourceFileIds },
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
  /** Distinct pages citing either file of a pair: a page citing both counts once. */
  const union = (rows: { fileId: string; pageId: number }[]) => {
    const unions = new Map<string, number>();
    for (const pair of pairs) {
      const pages = new Set(
        rows
          .filter(
            (row) =>
              row.fileId === pair.fileId || row.fileId === pair.counterpartId,
          )
          .map((row) => row.pageId),
      );
      unions.set(pair.fileId, pages.size);
    }
    return unions;
  };
  const approvedUnion = union(approved!);
  const candidatesUnion = union(candidates!);
  const pairByFile = new Map(pairs.map((pair) => [pair.fileId, pair]));
  return files.map((f): BrainDocument => {
    const pair = pairByFile.get(f.id);
    return {
      fileId: f.id,
      fileName: f.fileName,
      approvedPages: approvedBy.get(f.id) ?? 0,
      candidatePages: candidatesBy.get(f.id) ?? 0,
      retrieval: retrievalState(f.embeddingStatus),
      uploadedAt: f.createdAt?.toISOString() ?? null,
      language: f.language,
      ...(pair
        ? {
            pair: {
              fileId: pair.counterpartId,
              fileName: pair.counterpartName,
              language: pair.counterpartLanguage,
              approvedPages: approvedUnion.get(f.id) ?? 0,
              candidatePages: candidatesUnion.get(f.id) ?? 0,
            },
          }
        : {}),
    };
  });
}

/**
 * Each listed file's counterpart, with the counterpart's name and language,
 * whether or not the counterpart is itself in this list (a language filter may
 * hide it). Brain lists every extractable file of the organization to anyone
 * who may open it, so the far end of a pair discloses nothing the list does
 * not already show; the pair is read by organization, not by file access.
 * Nothing while the feature is off.
 */
async function pairsOf(orgId: string, fileIds: string[]) {
  if (!(await isFeatureEnabledQuery(orgId, 'languagePairs'))) {
    return [];
  }
  const rows = await db.documentPair.findMany({
    where: {
      organizationId: orgId,
      OR: [{ fileAId: { in: fileIds } }, { fileBId: { in: fileIds } }],
    },
    select: { fileAId: true, fileBId: true },
  });
  if (rows.length === 0) {
    return [];
  }
  const listed = new Set(fileIds);
  const links = rows.flatMap((row) => [
    ...(listed.has(row.fileAId)
      ? [{ fileId: row.fileAId, counterpartId: row.fileBId }]
      : []),
    ...(listed.has(row.fileBId)
      ? [{ fileId: row.fileBId, counterpartId: row.fileAId }]
      : []),
  ]);
  const counterparts = await db.userFile.findMany({
    where: {
      organizationId: orgId,
      id: { in: links.map((link) => link.counterpartId) },
      publishedPages: { none: {} },
    },
    select: { id: true, fileName: true, language: true },
  });
  const byId = new Map(counterparts.map((file) => [file.id, file]));
  return links.flatMap((link) => {
    const file = byId.get(link.counterpartId);
    return file
      ? [
          {
            ...link,
            counterpartName: file.fileName,
            counterpartLanguage: file.language,
          },
        ]
      : [];
  });
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
