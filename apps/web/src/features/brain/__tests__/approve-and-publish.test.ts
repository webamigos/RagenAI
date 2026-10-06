import { expect, it, vi, beforeEach } from 'vitest';
const approve = vi.hoisted(() => ({ approveKnowledgePageCommand: vi.fn() }));
const publish = vi.hoisted(() => ({ publishKnowledgePageCommand: vi.fn() }));
vi.mock('../services/commands/approve-knowledge-page-command', () => approve);
vi.mock('../services/commands/publish-knowledge-page-command', () => publish);
const { approveAndPublishKnowledgePageCommand } =
  await import('../services/commands/approve-and-publish-knowledge-page-command');
const input = {
  orgId: 'org',
  actorId: 'actor',
  publicId: 'page',
  expectedUpdatedAt: '2026-10-06T10:00:00.000Z',
};
beforeEach(() => {
  vi.resetAllMocks();
});
it('publishes using the timestamp returned by the approval, not an intervening read', async () => {
  approve.approveKnowledgePageCommand.mockResolvedValue({
    success: true,
    changed: true,
    updatedAt: '2026-10-06T10:01:00.000Z',
  });
  publish.publishKnowledgePageCommand.mockResolvedValue({
    success: true,
    changed: true,
  });
  expect(await approveAndPublishKnowledgePageCommand(input)).toEqual({
    success: true,
    changed: true,
  });
  expect(publish.publishKnowledgePageCommand).toHaveBeenCalledWith({
    ...input,
    expectedUpdatedAt: '2026-10-06T10:01:00.000Z',
  });
});
it('never publishes after a refused approval', async () => {
  approve.approveKnowledgePageCommand.mockResolvedValue({
    success: false,
    error: 'conflict',
  });
  expect(await approveAndPublishKnowledgePageCommand(input)).toEqual({
    success: false,
    error: 'conflict',
  });
  expect(publish.publishKnowledgePageCommand).not.toHaveBeenCalled();
});
it('returns publication failure while preserving the committed approval', async () => {
  approve.approveKnowledgePageCommand.mockResolvedValue({
    success: true,
    changed: true,
    updatedAt: input.expectedUpdatedAt,
  });
  publish.publishKnowledgePageCommand.mockResolvedValue({
    success: false,
    error: 'failed-to-start',
  });
  expect(await approveAndPublishKnowledgePageCommand(input)).toEqual({
    success: false,
    error: 'failed-to-start',
    approved: true,
  });
});
