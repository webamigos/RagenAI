import db from '@ragenai/prisma-client';

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
    select: { publicId: true, title: true, slug: true, status: true },
    orderBy: { title: 'asc' },
    take: 2000,
  });
  const title = normalizeTitle(page.title);
  const slug = baseSlug(page.slug);
  const targets = rows.map((r) => ({
    publicId: r.publicId,
    title: r.title,
    status: r.status as MergeTarget['status'],
    suggested: normalizeTitle(r.title) === title || baseSlug(r.slug) === slug,
  }));
  return [
    ...targets.filter((t) => t.suggested),
    ...targets.filter((t) => !t.suggested),
  ].slice(0, MERGE_TARGETS_SHOWN);
}

export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function baseSlug(slug: string): string {
  return slug.replace(/-\d+$/, '');
}
