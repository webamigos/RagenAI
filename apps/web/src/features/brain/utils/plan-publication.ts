import { PUBLISHED_FILE_METADATA_KEY } from '@ragenai/brain-contracts';

import type { ReviewError } from '../contracts/brain-review.types';
import { normalizeAccess, sameAccess } from './normalize-access';

/** What publishing a page needs to know about it. */
export type PublicationCandidate = {
  status: string;
  ownerId: string | null;
  accessibleBy: string[];
  contentHash: string;
  publishedAt: Date | null;
  publishedFile: { embeddingStatus: string; metadata: unknown } | null;
};

/** What publishing a page needs to know about the organization. */
export type PublicationContext = {
  ownerIsMember: boolean;
  memberIds: ReadonlySet<string>;
  teamIds: ReadonlySet<string>;
};

/**
 * What publishing would do to one page: refuse it, write a new generation
 * (`changed`), re-queue an unfinished write at the current one (`queue`
 * alone), or nothing.
 *
 * One function for the publish command and for the counts that promise what
 * it will do. "Opublikuj zatwierdzone (n)" and the overview's "n do
 * opublikowania" counted three different things, and none of them was what a
 * click actually published. Both now ask this.
 */
export function planPublication(
  orgId: string,
  page: PublicationCandidate,
  context: PublicationContext,
): { error: ReviewError } | { changed: boolean; queue: boolean } {
  if (page.status !== 'APPROVED') {
    return { error: 'invalid-status' };
  }
  if (page.ownerId === null) {
    return { error: 'owner-required' };
  }
  if (!context.ownerIsMember) {
    return { error: 'owner-not-member' };
  }
  if (page.accessibleBy.length === 0) {
    return { error: 'no-access' };
  }
  const valid = normalizeAccess(orgId, page.accessibleBy, context);
  if (valid === null || !sameAccess(valid, page.accessibleBy)) {
    return { error: 'invalid-access' };
  }
  if (
    page.publishedAt &&
    publishedHash(page.publishedFile?.metadata) === page.contentHash
  ) {
    return {
      changed: false,
      queue: page.publishedFile?.embeddingStatus !== 'COMPLETED',
    };
  }
  return { changed: true, queue: true };
}

/**
 * The approved pages a bulk publication walks: serving, or never published.
 * Not a withdrawn page: it keeps its file and has no `publishedAt`, and a
 * withdrawal is a person's decision that only a person reverses.
 */
export function bulkPublicationWhere(orgId: string) {
  return {
    organizationId: orgId,
    status: 'APPROVED' as const,
    OR: [{ publishedAt: { not: null } }, { publishedFileId: null }],
  };
}

/** The `user:` and `team:` ids a principal list names. */
export function principalIds(principals: ReadonlyArray<string>): {
  userIds: string[];
  teamIds: string[];
} {
  return {
    userIds: principals
      .filter((p) => p.startsWith('user:'))
      .map((p) => p.slice(5)),
    teamIds: principals
      .filter((p) => p.startsWith('team:'))
      .map((p) => p.slice(5)),
  };
}

function publishedHash(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object') {
    const block = (metadata as Record<string, unknown>)[
      PUBLISHED_FILE_METADATA_KEY
    ];
    if (block && typeof block === 'object' && 'contentHash' in block) {
      const hash = (block as { contentHash: unknown }).contentHash;
      return typeof hash === 'string' ? hash : null;
    }
  }
  return null;
}
