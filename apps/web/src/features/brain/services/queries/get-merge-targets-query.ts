import db from '@ragenai/prisma-client';

import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import type { MergeTarget } from '../../contracts/brain-review.types';

/** How many pages the merge picker offers; suggestions always come first. */
export const MERGE_TARGETS_SHOWN = 300;

/**
 * The pages a candidate may be merged into (spec D2b): every page of the
 * organization that is not rejected, other than itself — suggestions first.
 *
 * **A suggestion is a page that looks like the same subject**: the same
 * title ignoring case and spacing, or the same slug once a numeric suffix is
 * taken off. The suffix is how `replaceCandidatesFromFile` names a fresh
 * candidate it would not put over curated work (`urlop` → `urlop-2`), so
 * those pairs are exactly the ones the review queue exists to merge. C1's
 * contradiction search uses titles the same way, and has the same limit: two
 * names for one thing are not found. Embeddings are the next step for both.
 */
export async function getMergeTargetsQuery(
  orgId: string,
  page: { id: number; title: string; slug: string },
): Promise<MergeTarget[]> {
  const rows = await db.knowledgePage.findMany({
    where: {
      organizationId: orgId,
      id: { not: page.id },
      status: { in: ['CANDIDATE', 'APPROVED', 'STALE'] },
    },
    select: { id: true, publicId: true, title: true, slug: true, status: true },
    orderBy: { title: 'asc' },
    take: 2000,
  });
  const sameContent = await pagesCitingCounterparts(orgId, page.id);
  const title = normalizeTitle(page.title);
  const slug = baseSlug(page.slug);
  const targets = rows.map((r) => ({
    publicId: r.publicId,
    title: r.title,
    status: r.status as MergeTarget['status'],
    suggested: normalizeTitle(r.title) === title || baseSlug(r.slug) === slug,
    ...(sameContent.has(r.id) ? { sameContentInOtherLanguage: true } : {}),
  }));
  return [
    ...targets.filter((t) => t.sameContentInOtherLanguage),
    ...targets.filter((t) => !t.sameContentInOtherLanguage && t.suggested),
    ...targets.filter((t) => !t.sameContentInOtherLanguage && !t.suggested),
  ].slice(0, MERGE_TARGETS_SHOWN);
}

/**
 * Pages that cite the counterpart, in another language, of a document this
 * page cites (ADR-54). The pair is what says two files are one document, so a
 * page drawn from the Polish half and one drawn from the English half are the
 * likeliest to be the same page. Read by organization: Brain already offers
 * every live page of the organization here. Nothing while the feature is off.
 */
async function pagesCitingCounterparts(
  orgId: string,
  pageId: number,
): Promise<Set<number>> {
  if (!(await isFeatureEnabledQuery(orgId, 'languagePairs'))) {
    return new Set();
  }
  const cited = await db.knowledgePageSource.findMany({
    where: { organizationId: orgId, pageId },
    distinct: ['fileId'],
    select: { fileId: true },
  });
  const fileIds = cited.map((source) => source.fileId);
  if (fileIds.length === 0) {
    return new Set();
  }
  const pairs = await db.documentPair.findMany({
    where: {
      organizationId: orgId,
      OR: [{ fileAId: { in: fileIds } }, { fileBId: { in: fileIds } }],
    },
    select: { fileAId: true, fileBId: true },
  });
  const own = new Set(fileIds);
  const counterparts = pairs.flatMap((pair) => [
    ...(own.has(pair.fileAId) ? [pair.fileBId] : []),
    ...(own.has(pair.fileBId) ? [pair.fileAId] : []),
  ]);
  if (counterparts.length === 0) {
    return new Set();
  }
  const sources = await db.knowledgePageSource.findMany({
    where: {
      organizationId: orgId,
      fileId: { in: counterparts },
      pageId: { not: pageId },
    },
    distinct: ['pageId'],
    select: { pageId: true },
  });
  return new Set(sources.map((source) => source.pageId));
}

export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function baseSlug(slug: string): string {
  return slug.replace(/-\d+$/, '');
}
