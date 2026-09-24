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
});
