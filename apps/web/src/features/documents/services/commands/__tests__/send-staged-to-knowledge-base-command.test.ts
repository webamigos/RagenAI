import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userFile: { findMany: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const reembed = vi.hoisted(() => ({ reembedFileCommand: vi.fn() }));
vi.mock('../reembed-file-command', () => reembed);
const guards = vi.hoisted(() => ({ assertCanManageDocuments: vi.fn() }));
vi.mock('@/features/subscriptions/services/feature-guards', () => guards);
vi.mock('@/app/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

const { sendStagedToKnowledgeBaseCommand } =
  await import('../send-staged-to-knowledge-base-command');

beforeEach(() => {
  vi.clearAllMocks();
  reembed.reembedFileCommand.mockResolvedValue({ workflowId: 'w' });
});

describe('sendStagedToKnowledgeBaseCommand', () => {
  it('selects this organization’s STAGED files only — never a withdrawn one', async () => {
    db.userFile.findMany.mockResolvedValue([]);
    await sendStagedToKnowledgeBaseCommand({
      organizationId: 'org-1',
      fileIds: ['a', 'a', 'b'],
      onlyOwnedBy: null,
    });
    expect(db.userFile.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      id: { in: ['a', 'b'] },
      embeddingStatus: 'STAGED',
      publishedPages: { none: {} },
    });
    expect(guards.assertCanManageDocuments).toHaveBeenCalledWith('org-1');
  });

  it('switches the destination before re-running ingest, and reports what it skipped', async () => {
    db.userFile.findMany.mockResolvedValue([
      { id: 'a', metadata: { intake: 'brain', summary: 's' } },
    ]);
    await expect(
      sendStagedToKnowledgeBaseCommand({
        organizationId: 'org-1',
        fileIds: ['a', 'withdrawn'],
        onlyOwnedBy: null,
      }),
    ).resolves.toEqual({ sent: ['a'], skipped: ['withdrawn'] });
    expect(db.userFile.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: 'a', embeddingStatus: 'STAGED' },
      data: { metadata: { intake: 'knowledge-base', summary: 's' } },
    });
    expect(reembed.reembedFileCommand).toHaveBeenCalledWith('a', 'org-1');
    expect(db.userFile.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      reembed.reembedFileCommand.mock.invocationCallOrder[0]!,
    );
  });

  it('lets a member send only the staged files they uploaded', async () => {
    db.userFile.findMany.mockResolvedValue([]);
    await sendStagedToKnowledgeBaseCommand({
      organizationId: 'org-1',
      fileIds: ['a'],
      onlyOwnedBy: 'u-7',
    });
    expect(db.userFile.findMany.mock.calls[0][0].where.ownerId).toBe('u-7');
  });

  it('puts a file back to staged when its ingest could not start, so sending again works', async () => {
    db.userFile.findMany.mockResolvedValue([
      { id: 'a', metadata: { intake: 'brain', summary: 's' } },
    ]);
    db.userFile.updateMany.mockResolvedValue({ count: 1 });
    reembed.reembedFileCommand.mockRejectedValue(new Error('redis down'));
    await expect(
      sendStagedToKnowledgeBaseCommand({
        organizationId: 'org-1',
        fileIds: ['a'],
        onlyOwnedBy: null,
      }),
    ).resolves.toEqual({ sent: [], skipped: ['a'] });
    expect(db.userFile.updateMany).toHaveBeenLastCalledWith({
      where: {
        organizationId: 'org-1',
        id: 'a',
        embeddingStatus: { in: ['STAGED', 'NOT_STARTED'] },
      },
      data: {
        embeddingStatus: 'STAGED',
        metadata: { intake: 'brain', summary: 's' },
      },
    });
  });
});
