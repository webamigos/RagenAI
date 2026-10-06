import { beforeEach, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  userFile: { findFirst: vi.fn(), updateMany: vi.fn() },
  member: { findFirst: vi.fn() },
  knowledgePage: { findMany: vi.fn(), updateMany: vi.fn() },
  knowledgeDecision: { create: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({
  default: { $transaction: async (fn: (arg: typeof tx) => unknown) => fn(tx) },
}));
const reconcile = vi.hoisted(() => ({ startFindingsReconcile: vi.fn() }));
vi.mock('../services/commands/start-findings-reconcile', () => reconcile);
const { setOwnerForDocumentCandidatesCommand } =
  await import('../services/commands/set-owner-for-document-candidates-command');
const input = {
  orgId: 'org',
  actorId: 'actor',
  fileId: 'file',
  ownerId: 'owner',
};
beforeEach(() => {
  vi.resetAllMocks();
  tx.userFile.findFirst.mockResolvedValue({ id: 'file' });
  tx.member.findFirst.mockResolvedValue({ id: 'm' });
  tx.$queryRaw.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  tx.knowledgePage.findMany.mockResolvedValue([
    { id: 1, ownerId: null, publishedFileId: null },
    { id: 2, ownerId: 'owner', publishedFileId: null },
  ]);
});
it('locks distinct candidate pages and records only changed owners in the same transaction', async () => {
  expect(await setOwnerForDocumentCandidatesCommand(input)).toEqual({
    success: true,
    changed: true,
  });
  const [strings, ...values] = tx.$queryRaw.mock.calls[0];
  expect(strings.join('?')).toMatch(/FOR UPDATE/);
  expect(values).toContain('org');
  expect(values).toContain('file');
  expect(tx.knowledgePage.findMany.mock.calls[0][0].where).toMatchObject({
    organizationId: 'org',
    status: 'CANDIDATE',
    id: { in: [1, 2] },
  });
  expect(tx.knowledgePage.updateMany).toHaveBeenCalledWith({
    where: { organizationId: 'org', id: 1 },
    data: { ownerId: 'owner' },
  });
  expect(tx.knowledgeDecision.create).toHaveBeenCalledTimes(1);
  expect(tx.knowledgeDecision.create.mock.calls[0][0].data).toMatchObject({
    organizationId: 'org',
    pageId: 1,
    actorId: 'actor',
    action: 'SET_OWNER',
    before: { ownerId: null },
    after: { ownerId: 'owner' },
  });
  expect(reconcile.startFindingsReconcile).toHaveBeenCalledTimes(1);
});
it('refuses another organization file or a non-member without any writes', async () => {
  tx.userFile.findFirst.mockResolvedValue(null);
  expect(await setOwnerForDocumentCandidatesCommand(input)).toEqual({
    success: false,
    error: 'not-found',
  });
  tx.userFile.findFirst.mockResolvedValue({ id: 'file' });
  tx.member.findFirst.mockResolvedValue(null);
  expect(await setOwnerForDocumentCandidatesCommand(input)).toEqual({
    success: false,
    error: 'owner-not-member',
  });
  expect(tx.knowledgeDecision.create).not.toHaveBeenCalled();
});
it('does not append decisions when all candidates already have the chosen owner', async () => {
  tx.knowledgePage.findMany.mockResolvedValue([{ id: 2, ownerId: 'owner' }]);
  expect(await setOwnerForDocumentCandidatesCommand(input)).toEqual({
    success: true,
    changed: false,
  });
  expect(reconcile.startFindingsReconcile).not.toHaveBeenCalled();
});
it('mirrors a retained publication owner only in the organization-scoped page file', async () => {
  tx.knowledgePage.findMany.mockResolvedValue([
    { id: 1, ownerId: null, publishedFileId: 'published-file' },
  ]);
  await setOwnerForDocumentCandidatesCommand(input);
  expect(tx.userFile.updateMany).toHaveBeenCalledWith({
    where: { organizationId: 'org', id: 'published-file' },
    data: { ownerId: 'owner' },
  });
});
