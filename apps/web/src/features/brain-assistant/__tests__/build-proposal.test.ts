import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const db = vi.hoisted(() => ({
  knowledgePage: { findMany: vi.fn() },
  member: { findFirst: vi.fn(), findMany: vi.fn() },
  team: { findMany: vi.fn() },
  knowledgeFinding: { findFirst: vi.fn() },
  userFile: { findFirst: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));

const { buildBrainProposalQuery } =
  await import('../services/queries/build-brain-proposal-query');

const ORG = 'org-1';
const A = '11111111-2222-4333-8444-555555555555';
const B = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const updatedAt = new Date('2026-09-25T10:00:00.000Z');

function row(publicId: string, over: object = {}) {
  return {
    publicId,
    title: `Page ${publicId.slice(0, 1)}`,
    status: 'CANDIDATE',
    updatedAt,
    publishedAt: null,
    ownerId: 'u-1',
    accessibleBy: [`org:${ORG}`],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.member.findMany.mockResolvedValue([]);
  db.team.findMany.mockResolvedValue([]);
});

describe('buildBrainProposalQuery', () => {
  it('reads every page inside the organization and records the version it read', async () => {
    db.knowledgePage.findMany.mockResolvedValue([row(B), row(A)]);
    const proposal = await buildBrainProposalQuery(ORG, {
      action: 'APPROVE',
      pageIds: [A, B],
      reason: 'Quotes verified',
    });
    expect(db.knowledgePage.findMany.mock.calls[0]![0].where).toEqual({
      organizationId: ORG,
      publicId: { in: [A, B] },
    });
    expect(proposal).toMatchObject({
      action: 'APPROVE',
      reason: 'Quotes verified',
      outcome: null,
      // In the order the model named them.
      pages: [
        { publicId: A, updatedAt: updatedAt.toISOString() },
        { publicId: B, updatedAt: updatedAt.toISOString() },
      ],
    });
  });

  it('refuses a page the organization does not hold, rather than a card with a hole', async () => {
    db.knowledgePage.findMany.mockResolvedValue([row(A)]);
    expect(
      await buildBrainProposalQuery(ORG, {
        action: 'REJECT',
        pageIds: [A, B],
        reason: 'r',
      }),
    ).toBe('unknown-page');
  });

  it('leaves out pages the action does not apply to, and refuses when none is left', async () => {
    db.knowledgePage.findMany.mockResolvedValue([
      row(A),
      row(B, { ownerId: null }),
    ]);
    const proposal = await buildBrainProposalQuery(ORG, {
      action: 'APPROVE',
      pageIds: [A, B],
      reason: 'r',
    });
    expect(proposal).toMatchObject({ pages: [{ publicId: A }] });

    db.knowledgePage.findMany.mockResolvedValue([
      row(A, { status: 'APPROVED' }),
    ]);
    expect(
      await buildBrainProposalQuery(ORG, {
        action: 'REJECT',
        pageIds: [A],
        reason: 'r',
      }),
    ).toBe('not-applicable');
  });

  it('shows who a published page will be retrievable by', async () => {
    db.knowledgePage.findMany.mockResolvedValue([
      row(A, { status: 'APPROVED', accessibleBy: ['team:t-1'] }),
    ]);
    db.team.findMany.mockResolvedValue([{ id: 't-1', name: 'HR' }]);
    const proposal = await buildBrainProposalQuery(ORG, {
      action: 'PUBLISH',
      pageIds: [A],
      reason: 'Approved and owned',
    });
    expect(proposal).toMatchObject({
      audience: [[{ kind: 'team', id: 't-1', name: 'HR' }]],
    });
  });

  it('previews a merge with the narrower of the two pages’ access', async () => {
    db.knowledgePage.findMany.mockResolvedValue([
      row(A, { accessibleBy: ['team:t-1'] }),
      row(B, { status: 'APPROVED', accessibleBy: [`org:${ORG}`] }),
    ]);
    db.team.findMany.mockResolvedValue([{ id: 't-1', name: 'HR' }]);
    const proposal = await buildBrainProposalQuery(ORG, {
      action: 'MERGE',
      sourcePageId: A,
      targetPageId: B,
      reason: 'Same subject',
    });
    expect(proposal).toMatchObject({
      action: 'MERGE',
      source: { publicId: A },
      target: { publicId: B },
      preview: { access: [{ kind: 'team', id: 't-1', name: 'HR' }] },
    });
    expect(
      await buildBrainProposalQuery(ORG, {
        action: 'MERGE',
        sourcePageId: A,
        targetPageId: A,
        reason: 'r',
      }),
    ).toBe('same-page');
  });

  it('names an owner only if they are a member here', async () => {
    db.knowledgePage.findMany.mockResolvedValue([row(A)]);
    db.member.findFirst.mockResolvedValue(null);
    expect(
      await buildBrainProposalQuery(ORG, {
        action: 'SET_OWNER',
        pageId: A,
        ownerId: 'u-elsewhere',
        reason: 'r',
      }),
    ).toBe('unknown-owner');
    expect(db.member.findFirst.mock.calls[0]![0].where).toEqual({
      organizationId: ORG,
      userId: 'u-elsewhere',
    });

    db.member.findFirst.mockResolvedValue({
      userId: 'u-2',
      user: { name: null, email: 'ola@x.pl' },
    });
    expect(
      await buildBrainProposalQuery(ORG, {
        action: 'SET_OWNER',
        pageId: A,
        ownerId: 'u-2',
        reason: 'r',
      }),
    ).toMatchObject({ owner: { id: 'u-2', name: 'ola@x.pl' } });
  });

  it('says when a change of access widens it', async () => {
    db.knowledgePage.findMany.mockResolvedValue([
      row(A, { accessibleBy: ['team:t-1'] }),
    ]);
    const proposal = await buildBrainProposalQuery(ORG, {
      action: 'SET_ACCESS',
      pageId: A,
      principals: [`org:${ORG}`],
      reason: 'Everyone needs it',
    });
    expect(proposal).toMatchObject({
      principals: [`org:${ORG}`],
      preview: { widens: true, after: [{ kind: 'organization' }] },
    });
  });

  it('retries only an open extraction failure of this organization', async () => {
    db.knowledgeFinding.findFirst.mockResolvedValue(null);
    expect(
      await buildBrainProposalQuery(ORG, {
        action: 'RETRY_EXTRACTION',
        findingId: A,
        reason: 'r',
      }),
    ).toBe('unknown-finding');
    expect(db.knowledgeFinding.findFirst.mock.calls[0]![0].where).toEqual({
      organizationId: ORG,
      publicId: A,
      type: 'EXTRACTION_FAILED',
      status: 'OPEN',
    });
  });
});
