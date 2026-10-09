import { PUBLISHED_FILE_METADATA_KEY } from '@ragenai/brain-contracts';
import { describe, expect, it } from 'vitest';

import {
  bulkPublicationWhere,
  planPublication,
  principalIds,
  type PublicationCandidate,
} from '../plan-publication';

const ORG = 'org-1';
const context = {
  ownerIsMember: true,
  memberIds: new Set(['u1']),
  teamIds: new Set(['hr']),
};
const servedAt = (hash: string, embeddingStatus = 'COMPLETED') => ({
  embeddingStatus,
  metadata: { [PUBLISHED_FILE_METADATA_KEY]: { contentHash: hash } },
});
const page = (
  over: Partial<PublicationCandidate> = {},
): PublicationCandidate => ({
  status: 'APPROVED',
  ownerId: 'u1',
  accessibleBy: [`org:${ORG}`],
  contentHash: 'h1',
  publishedAt: null,
  publishedFile: null,
  ...over,
});

describe('planPublication', () => {
  it('publishes an approved page that was never published', () => {
    expect(planPublication(ORG, page(), context)).toEqual({
      changed: true,
      queue: true,
    });
  });

  it('writes nothing for a page already serving this content', () => {
    expect(
      planPublication(
        ORG,
        page({ publishedAt: new Date(), publishedFile: servedAt('h1') }),
        context,
      ),
    ).toEqual({ changed: false, queue: false });
  });

  it('re-queues a page serving this content whose write never finished', () => {
    expect(
      planPublication(
        ORG,
        page({
          publishedAt: new Date(),
          publishedFile: servedAt('h1', 'STARTED'),
        }),
        context,
      ),
    ).toEqual({ changed: false, queue: true });
  });

  it('republishes a page whose content changed since it was published', () => {
    expect(
      planPublication(
        ORG,
        page({ publishedAt: new Date(), publishedFile: servedAt('old') }),
        context,
      ),
    ).toEqual({ changed: true, queue: true });
  });

  it('refuses in the order the reviewer has to fix things', () => {
    expect(
      planPublication(ORG, page({ status: 'CANDIDATE' }), context),
    ).toEqual({ error: 'invalid-status' });
    expect(planPublication(ORG, page({ ownerId: null }), context)).toEqual({
      error: 'owner-required',
    });
    expect(
      planPublication(ORG, page(), { ...context, ownerIsMember: false }),
    ).toEqual({ error: 'owner-not-member' });
    expect(planPublication(ORG, page({ accessibleBy: [] }), context)).toEqual({
      error: 'no-access',
    });
    expect(
      planPublication(ORG, page({ accessibleBy: ['team:gone'] }), context),
    ).toEqual({ error: 'invalid-access' });
  });
});

describe('bulkPublicationWhere', () => {
  it('takes serving and never-published approved pages, never a withdrawn one', () => {
    expect(bulkPublicationWhere(ORG)).toEqual({
      organizationId: ORG,
      status: 'APPROVED',
      OR: [{ publishedAt: { not: null } }, { publishedFileId: null }],
    });
  });
});

describe('principalIds', () => {
  it('splits user and team principals and ignores the org-wide one', () => {
    expect(principalIds([`org:${ORG}`, 'user:u1', 'team:hr'])).toEqual({
      userIds: ['u1'],
      teamIds: ['hr'],
    });
  });
});
