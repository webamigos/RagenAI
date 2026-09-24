import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The review commands (spec D2), against a transaction double that records
 * what each one wrote. What they pin: the page and its ledger row are written
 * together or not at all, a decision against a page that changed since it was
 * read writes nothing, and widening is decided here — not by the caller.
 */

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  knowledgePage: { findFirst: vi.fn(), updateMany: vi.fn() },
  knowledgeDecision: { create: vi.fn() },
  member: { findFirst: vi.fn(), findMany: vi.fn() },
  team: { findMany: vi.fn() },
}));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const reconcile = vi.hoisted(() => ({ startFindingsReconcile: vi.fn() }));
vi.mock('../services/commands/start-findings-reconcile', () => reconcile);

const { approveKnowledgePageCommand } =
  await import('../services/commands/approve-knowledge-page-command');
const { rejectKnowledgePageCommand } =
  await import('../services/commands/reject-knowledge-page-command');
const { setKnowledgePageOwnerCommand } =
  await import('../services/commands/set-knowledge-page-owner-command');
const { setKnowledgePageAccessCommand } =
  await import('../services/commands/set-knowledge-page-access-command');

const ORG = 'org-1';
const SEEN = new Date('2026-09-23T10:00:00.123Z');
const base = {
  orgId: ORG,
  actorId: 'u-admin',
  publicId: '11111111-2222-4333-8444-555555555555',
  expectedUpdatedAt: SEEN.toISOString(),
};

function givenPage(page: Partial<Record<string, unknown>> = {}) {
  tx.$queryRaw.mockResolvedValue([{ id: 7 }]);
  tx.knowledgePage.findFirst.mockResolvedValue({
    id: 7,
    status: 'CANDIDATE',
    ownerId: null,
    accessibleBy: ['user:u1'],
    publishedAt: null,
    updatedAt: SEEN,
    ...page,
  });
}

function recorded() {
  return {
    page: tx.knowledgePage.updateMany.mock.calls.map(([a]) => a),
    decisions: tx.knowledgeDecision.create.mock.calls.map(([a]) => a.data),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.member.findFirst.mockResolvedValue({ id: 'm' });
  tx.member.findMany.mockResolvedValue([]);
  tx.team.findMany.mockResolvedValue([]);
});

describe('every decision', () => {
  it('locks the page by publicId inside the organization', async () => {
    givenPage();
    await rejectKnowledgePageCommand(base);
    const [strings, ...values] = tx.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toMatch(/FOR UPDATE/);
    expect(values).toEqual([base.publicId, ORG]);
    expect(tx.knowledgePage.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      id: 7,
    });
  });

  it('answers not-found for a page of another organization, writing nothing', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(rejectKnowledgePageCommand(base)).resolves.toEqual({
      success: false,
      error: 'not-found',
    });
    expect(recorded()).toEqual({ page: [], decisions: [] });
  });

  it('refuses a page that changed after the reviewer read it', async () => {
    givenPage({ updatedAt: new Date(SEEN.getTime() + 1) });
    await expect(rejectKnowledgePageCommand(base)).resolves.toEqual({
      success: false,
      error: 'conflict',
    });
    expect(recorded()).toEqual({ page: [], decisions: [] });
  });

  it('writes the page and its ledger row, scoped, with no generation', async () => {
    givenPage();
    await expect(rejectKnowledgePageCommand(base)).resolves.toEqual({
      success: true,
      changed: true,
    });
    const { page, decisions } = recorded();
    expect(page).toEqual([
      { where: { organizationId: ORG, id: 7 }, data: { status: 'REJECTED' } },
    ]);
    expect(decisions).toEqual([
      {
        organizationId: ORG,
        pageId: 7,
        actorId: 'u-admin',
        action: 'REJECT',
        publicationGeneration: null,
        before: { status: 'CANDIDATE' },
        after: { status: 'REJECTED' },
      },
    ]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(reconcile.startFindingsReconcile).toHaveBeenCalledWith(ORG);
  });

  it('re-runs the findings only after a decision that changed something', async () => {
    givenPage({ updatedAt: new Date(SEEN.getTime() + 1) });
    await rejectKnowledgePageCommand(base);
    givenPage({ ownerId: 'u1' });
    await setKnowledgePageOwnerCommand({ ...base, ownerId: 'u1' });
    expect(reconcile.startFindingsReconcile).not.toHaveBeenCalled();
  });
});

describe('approveKnowledgePageCommand', () => {
  it('needs an owner', async () => {
    givenPage({ ownerId: null });
    await expect(approveKnowledgePageCommand(base)).resolves.toEqual({
      success: false,
      error: 'owner-required',
    });
  });

  it('needs an owner who is still a member', async () => {
    givenPage({ ownerId: 'u-left' });
    tx.member.findFirst.mockResolvedValue(null);
    await expect(approveKnowledgePageCommand(base)).resolves.toEqual({
      success: false,
      error: 'owner-not-member',
    });
    expect(tx.member.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      userId: 'u-left',
    });
  });

  it.each(['APPROVED', 'STALE', 'REJECTED'])(
    'approves only a candidate, not %s',
    async (status) => {
      givenPage({ status, ownerId: 'u1' });
      await expect(approveKnowledgePageCommand(base)).resolves.toEqual({
        success: false,
        error: 'invalid-status',
      });
      expect(recorded().decisions).toEqual([]);
    },
  );

  it('approves an owned candidate', async () => {
    givenPage({ ownerId: 'u1' });
    await expect(approveKnowledgePageCommand(base)).resolves.toEqual({
      success: true,
      changed: true,
    });
    expect(recorded().decisions[0]).toMatchObject({
      action: 'APPROVE',
      after: { status: 'APPROVED' },
    });
  });
});

describe('rejectKnowledgePageCommand', () => {
  it('does not reject an approved page — retiring one is Phase E', async () => {
    givenPage({ status: 'APPROVED' });
    await expect(rejectKnowledgePageCommand(base)).resolves.toEqual({
      success: false,
      error: 'invalid-status',
    });
  });
});

describe('setKnowledgePageOwnerCommand', () => {
  it('names any member, recording from whom to whom', async () => {
    givenPage({ ownerId: 'u-old' });
    await setKnowledgePageOwnerCommand({ ...base, ownerId: 'u-new' });
    expect(recorded().decisions[0]).toMatchObject({
      action: 'SET_OWNER',
      before: { ownerId: 'u-old' },
      after: { ownerId: 'u-new' },
    });
  });

  it('refuses someone who is not a member', async () => {
    givenPage();
    tx.member.findFirst.mockResolvedValue(null);
    await expect(
      setKnowledgePageOwnerCommand({ ...base, ownerId: 'u-stranger' }),
    ).resolves.toEqual({ success: false, error: 'owner-not-member' });
  });

  it('writes nothing when the owner is already that person', async () => {
    givenPage({ ownerId: 'u1' });
    await expect(
      setKnowledgePageOwnerCommand({ ...base, ownerId: 'u1' }),
    ).resolves.toEqual({ success: true, changed: false });
    expect(recorded()).toEqual({ page: [], decisions: [] });
  });

  it('does not re-own a rejected page', async () => {
    givenPage({ status: 'REJECTED' });
    await expect(
      setKnowledgePageOwnerCommand({ ...base, ownerId: 'u1' }),
    ).resolves.toEqual({ success: false, error: 'invalid-status' });
  });
});

describe('setKnowledgePageAccessCommand', () => {
  const members = (...ids: string[]) =>
    tx.member.findMany.mockResolvedValue(ids.map((userId) => ({ userId })));

  it('records a narrowing as SET_ACCESS, no confirmation needed', async () => {
    givenPage({ accessibleBy: ['user:u1', 'user:u2'] });
    members('u1');
    await expect(
      setKnowledgePageAccessCommand({ ...base, principals: ['user:u1'] }),
    ).resolves.toEqual({ success: true, changed: true });
    expect(recorded().decisions[0]).toMatchObject({
      action: 'SET_ACCESS',
      before: { accessibleBy: ['user:u1', 'user:u2'] },
      after: { accessibleBy: ['user:u1'] },
    });
  });

  it('refuses an unconfirmed widening and writes nothing', async () => {
    givenPage({ accessibleBy: ['user:u1'] });
    members('u1', 'u2');
    await expect(
      setKnowledgePageAccessCommand({
        ...base,
        principals: ['user:u1', 'user:u2'],
      }),
    ).resolves.toEqual({ success: false, error: 'confirm-widening' });
    expect(recorded()).toEqual({ page: [], decisions: [] });
  });

  it('calls a swap a widening — it adds a reader, whatever it removes', async () => {
    givenPage({ accessibleBy: ['user:u1'] });
    members('u2');
    await expect(
      setKnowledgePageAccessCommand({ ...base, principals: ['user:u2'] }),
    ).resolves.toEqual({ success: false, error: 'confirm-widening' });
  });

  it('records a confirmed widening as WIDEN_ACCESS', async () => {
    givenPage({ accessibleBy: ['user:u1'] });
    await setKnowledgePageAccessCommand({
      ...base,
      principals: [`org:${ORG}`],
      confirmWidening: true,
    });
    expect(recorded().decisions[0]).toMatchObject({
      action: 'WIDEN_ACCESS',
      after: { accessibleBy: [`org:${ORG}`] },
    });
    expect(recorded().page[0].data).toEqual({ accessibleBy: [`org:${ORG}`] });
  });

  it('counts leaving the organization-wide setting as a narrowing', async () => {
    givenPage({ accessibleBy: [`org:${ORG}`] });
    members('u1');
    await setKnowledgePageAccessCommand({ ...base, principals: ['user:u1'] });
    expect(recorded().decisions[0].action).toBe('SET_ACCESS');
  });

  it('refuses a principal that matches nobody here', async () => {
    givenPage();
    members('u1');
    await expect(
      setKnowledgePageAccessCommand({
        ...base,
        principals: ['user:u1', 'org:org-2'],
        confirmWidening: true,
      }),
    ).resolves.toEqual({ success: false, error: 'invalid-access' });
    expect(tx.member.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      userId: { in: ['u1'] },
    });
  });

  it('refuses a published page until the change can reach its chunks', async () => {
    givenPage({ publishedAt: new Date(), status: 'APPROVED' });
    await expect(
      setKnowledgePageAccessCommand({ ...base, principals: [] }),
    ).resolves.toEqual({ success: false, error: 'published' });
  });

  it('writes nothing when the set is the same in another order', async () => {
    givenPage({ accessibleBy: ['user:u1', 'user:u2'] });
    members('u1', 'u2');
    await expect(
      setKnowledgePageAccessCommand({
        ...base,
        principals: ['user:u2', 'user:u1'],
      }),
    ).resolves.toEqual({ success: true, changed: false });
    expect(recorded()).toEqual({ page: [], decisions: [] });
  });
});
