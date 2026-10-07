import db from '@ragenai/prisma-client';

import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

export type PairedPageCandidates = {
  /** Candidate pages that may be the same page as one drawn from the other language. */
  count: number;
  /** One to start reviewing from; its merge list already offers the match first. */
  firstPublicId: string | null;
};

const NONE: PairedPageCandidates = { count: 0, firstPublicId: null };

/**
 * Candidate pages that cite one half of a paired document while another live
 * page cites the other half (ADR-54): the likeliest duplicates across
 * languages. Only candidates count, because a merge absorbs only a candidate.
 *
 * It counts and points; it merges nothing. The reviewer opens the page and the
 * merge list puts the match first, so the merge itself stays the existing
 * picker, confirmation and command. Read by organization, like the merge list
 * it feeds, and across languages by nature: a language filter would hide the
 * very counterpart this looks for.
 */
export async function getPairedPageCandidatesQuery(
  orgId: string,
): Promise<PairedPageCandidates> {
  if (!(await isFeatureEnabledQuery(orgId, 'languagePairs'))) {
    return NONE;
  }
  const pairs = await db.documentPair.findMany({
    where: { organizationId: orgId },
    select: { fileAId: true, fileBId: true },
  });
  if (pairs.length === 0) {
    return NONE;
  }
  const counterpartOf = new Map<string, string>();
  for (const pair of pairs) {
    counterpartOf.set(pair.fileAId, pair.fileBId);
    counterpartOf.set(pair.fileBId, pair.fileAId);
  }
  const sources = await db.knowledgePageSource.findMany({
    where: {
      organizationId: orgId,
      fileId: { in: [...counterpartOf.keys()] },
      page: { status: { in: ['CANDIDATE', 'APPROVED', 'STALE'] } },
    },
    distinct: ['fileId', 'pageId'],
    select: {
      fileId: true,
      pageId: true,
      page: { select: { publicId: true, status: true, createdAt: true } },
    },
  });

  const pagesByFile = new Map<string, Set<number>>();
  for (const source of sources) {
    const pages = pagesByFile.get(source.fileId) ?? new Set<number>();
    pages.add(source.pageId);
    pagesByFile.set(source.fileId, pages);
  }
  const matches = new Map<number, { publicId: string; createdAt: Date }>();
  for (const source of sources) {
    if (source.page.status !== 'CANDIDATE' || matches.has(source.pageId)) {
      continue;
    }
    const others = pagesByFile.get(counterpartOf.get(source.fileId) ?? '');
    if (others && [...others].some((pageId) => pageId !== source.pageId)) {
      matches.set(source.pageId, {
        publicId: source.page.publicId,
        createdAt: source.page.createdAt,
      });
    }
  }
  const oldest = [...matches.values()].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.publicId.localeCompare(b.publicId),
  )[0];
  return { count: matches.size, firstPublicId: oldest?.publicId ?? null };
}
