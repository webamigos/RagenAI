import db from '@ragenai/prisma-client';

import type {
  KnowledgePageStatus,
  KnowledgePageType,
  PageRef,
} from '../../contracts/brain.types';

export type KnowledgePageSearchHit = PageRef & {
  type: KnowledgePageType;
  status: KnowledgePageStatus;
  /** The start of the page's text, for telling two similar titles apart. */
  excerpt: string;
  updatedAt: string;
};

/** Hits returned at most; a search that needs more is too broad to read. */
export const PAGE_SEARCH_LIMIT = 30;
const EXCERPT_LENGTH = 240;

/**
 * Pages whose title or text contains `text`, within the organization — the
 * curated set only, rejected pages included only when asked for. Titles
 * first: a page named for the words is more likely the one meant than a page
 * that mentions them.
 */
export async function searchKnowledgePagesQuery(
  orgId: string,
  text: string,
  options: { includeRejected?: boolean } = {},
): Promise<KnowledgePageSearchHit[]> {
  const needle = text.trim();
  if (needle.length < 2) {
    return [];
  }
  const rows = await db.knowledgePage.findMany({
    where: {
      organizationId: orgId,
      ...(options.includeRejected ? {} : { status: { not: 'REJECTED' } }),
      OR: [
        { title: { contains: needle, mode: 'insensitive' } },
        { content: { contains: needle, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SEARCH_LIMIT * 2,
    select: {
      publicId: true,
      title: true,
      type: true,
      status: true,
      content: true,
      updatedAt: true,
    },
  });
  const lower = needle.toLowerCase();
  const inTitle = (title: string) => title.toLowerCase().includes(lower);
  return [...rows]
    .sort((a, b) => Number(inTitle(b.title)) - Number(inTitle(a.title)))
    .slice(0, PAGE_SEARCH_LIMIT)
    .map((r) => ({
      publicId: r.publicId,
      title: r.title,
      type: r.type,
      status: r.status,
      excerpt: r.content.replace(/\s+/g, ' ').slice(0, EXCERPT_LENGTH),
      updatedAt: r.updatedAt.toISOString(),
    }));
}
