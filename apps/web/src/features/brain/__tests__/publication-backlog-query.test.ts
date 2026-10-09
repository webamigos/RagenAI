import { PUBLISHED_FILE_METADATA_KEY } from '@ragenai/brain-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
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
/** The pages SQL kept, as ids, and their rows. */
const writable = (...rows: ReturnType<typeof page>[]) => {
  db.$queryRaw.mockResolvedValue(rows.map((_, i) => ({ id: i + 1 })));
  db.knowledgePage.findMany.mockResolvedValue(rows);
};
const sql = () => {
  const [strings, ...values] = db.$queryRaw.mock.calls[0] as [
    TemplateStringsArray,
    ...unknown[],
  ];
  return { text: strings.join('?'), values };
};

beforeEach(() => {
  vi.resetAllMocks();
  db.member.findMany.mockResolvedValue([{ userId: 'u1' }]);
  db.team.findMany.mockResolvedValue([]);
});

describe('getPublicationBacklogQuery', () => {
  it('reads nothing more when no page would be written', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await expect(getPublicationBacklogQuery(ORG)).resolves.toEqual({
      pending: 0,
      refused: {},
    });
    expect(db.knowledgePage.findMany).not.toHaveBeenCalled();
    expect(db.member.findMany).not.toHaveBeenCalled();
    expect(db.team.findMany).not.toHaveBeenCalled();
  });

  it('keeps in SQL only what a run would write, in this organization', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await getPublicationBacklogQuery(ORG);
    const { text, values } = sql();
    expect(values).toContain(ORG);
    expect(values).toContain(PUBLISHED_FILE_METADATA_KEY);
    expect(text).toContain('p.organization_id = ?');
    // The pages the bulk run walks: approved, serving or never published.
    expect(text).toContain("p.status = 'APPROVED'");
    expect(text).toContain(
      'p.published_at IS NOT NULL OR p.published_file_id IS NULL',
    );
    // Narrowed to never published, changed, or unfinished.
    expect(text).toContain('p.published_at IS NULL');
    expect(text).toContain('IS DISTINCT FROM p.content_hash');
    expect(text).toContain("IS DISTINCT FROM 'COMPLETED'");
    expect(text).toContain('f.organization_id = p.organization_id');
  });

  it('counts the kept pages by the publication rules, refusals apart', async () => {
    writable(
      page(),
      page(served('old')),
      page(served('h1', 'STARTED')),
      page({ ownerId: null }),
      page({ ownerId: 'gone' }),
      page({ accessibleBy: [] }),
    );
    await expect(getPublicationBacklogQuery(ORG)).resolves.toEqual({
      pending: 3,
      refused: {
        'owner-required': 1,
        'owner-not-member': 1,
        'no-access': 1,
      },
    });
    expect(db.knowledgePage.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      id: { in: [1, 2, 3, 4, 5, 6] },
    });
  });

  it('asks only for the members and teams those pages name', async () => {
    writable(
      page({ ownerId: 'u1', accessibleBy: ['user:u2', 'team:hr'] }),
      page({ ownerId: 'u3' }),
    );
    db.member.findMany.mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
    ]);
    db.team.findMany.mockResolvedValue([{ id: 'hr' }]);
    await expect(getPublicationBacklogQuery(ORG)).resolves.toEqual({
      pending: 2,
      refused: {},
    });
    expect(db.member.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      userId: { in: ['u1', 'u2', 'u3'] },
    });
    expect(db.team.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      id: { in: ['hr'] },
    });
  });
});
