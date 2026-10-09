import { PUBLISHED_FILE_METADATA_KEY } from '@ragenai/brain-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  knowledgePage: { findMany: vi.fn() },
  member: { findMany: vi.fn() },
  team: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));

const { getPublicationBacklogQuery } =
  await import('../services/queries/get-publication-backlog-query');

const ORG = 'org-1';
const page = (over: Record<string, unknown> = {}) => ({
  status: 'APPROVED',
  ownerId: 'u1',
  accessibleBy: [`org:${ORG}`],
  contentHash: 'h1',
  publishedAt: null,
  publishedFile: null,
  ...over,
});
const served = (hash: string, embeddingStatus = 'COMPLETED') => ({
  publishedAt: new Date(),
  publishedFile: {
    embeddingStatus,
    metadata: { [PUBLISHED_FILE_METADATA_KEY]: { contentHash: hash } },
  },
});

beforeEach(() => {
  vi.resetAllMocks();
  db.member.findMany.mockResolvedValue([{ userId: 'u1' }]);
  db.team.findMany.mockResolvedValue([]);
});

describe('getPublicationBacklogQuery', () => {
  it('counts what publishing all would write, not every approved page', async () => {
    // Three approved pages, one of them already serving: the screen that
    // said "2 czekają" beside "Opublikuj zatwierdzone (3)".
    db.knowledgePage.findMany.mockResolvedValue([
      page(),
      page(),
      page(served('h1')),
    ]);
    await expect(getPublicationBacklogQuery(ORG)).resolves.toEqual({
      pending: 2,
      refused: {},
    });
  });

  it('counts a changed page and an unfinished write, and the refusals apart', async () => {
    db.knowledgePage.findMany.mockResolvedValue([
      page(served('old')),
      page(served('h1', 'STARTED')),
      page({ ownerId: null }),
      page({ ownerId: 'gone' }),
      page({ accessibleBy: [] }),
    ]);
    await expect(getPublicationBacklogQuery(ORG)).resolves.toEqual({
      pending: 2,
      refused: {
        'owner-required': 1,
        'owner-not-member': 1,
        'no-access': 1,
      },
    });
  });

  it('reads the pages the bulk run walks, and only this organization', async () => {
    db.knowledgePage.findMany.mockResolvedValue([]);
    await getPublicationBacklogQuery(ORG);
    expect(db.knowledgePage.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      status: 'APPROVED',
      OR: [{ publishedAt: { not: null } }, { publishedFileId: null }],
    });
    expect(db.member.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
    });
    expect(db.team.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
    });
  });
});
