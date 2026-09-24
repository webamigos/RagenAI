import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ knowledgePage: { findMany: vi.fn() } }));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const publish = vi.hoisted(() => ({ publishKnowledgePageCommand: vi.fn() }));
vi.mock('../services/commands/publish-knowledge-page-command', () => publish);

const { publishAllApprovedCommand } =
  await import('../services/commands/publish-all-approved-command');

const SEEN = new Date('2026-09-24T01:00:00.000Z');

beforeEach(() => vi.clearAllMocks());

describe('publishAllApprovedCommand', () => {
  it('publishes each approved page through the one publication path, and counts the outcomes', async () => {
    db.knowledgePage.findMany.mockResolvedValue([
      { id: 1, publicId: 'p1', updatedAt: SEEN },
      { id: 2, publicId: 'p2', updatedAt: SEEN },
      { id: 3, publicId: 'p3', updatedAt: SEEN },
      { id: 4, publicId: 'p4', updatedAt: SEEN },
      { id: 5, publicId: 'p5', updatedAt: SEEN },
    ]);
    publish.publishKnowledgePageCommand
      .mockResolvedValueOnce({ success: true, changed: true })
      .mockResolvedValueOnce({ success: true, changed: false })
      .mockResolvedValueOnce({ success: false, error: 'owner-required' })
      .mockResolvedValueOnce({ success: false, error: 'owner-required' })
      .mockResolvedValueOnce({ success: false, error: 'failed-to-start' });
    await expect(
      publishAllApprovedCommand({ orgId: 'org-1', actorId: 'u1' }),
    ).resolves.toEqual({
      queued: 1,
      unchanged: 1,
      refused: { 'owner-required': 2 },
      // Recorded but never queued is its own number, not a refusal.
      notWritten: 1,
    });
    expect(db.knowledgePage.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      status: 'APPROVED',
      id: { gt: 0 },
      // A withdrawn page (file kept, no publishedAt) is left alone.
      OR: [{ publishedAt: { not: null } }, { publishedFileId: null }],
    });
    expect(publish.publishKnowledgePageCommand).toHaveBeenCalledWith({
      orgId: 'org-1',
      actorId: 'u1',
      publicId: 'p1',
      expectedUpdatedAt: SEEN.toISOString(),
    });
  });

  it('walks every approved page in batches, never stopping at the first', async () => {
    const { PUBLISH_ALL_BATCH } =
      await import('../services/commands/publish-all-approved-command');
    const batch = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: from + i,
        publicId: `p${from + i}`,
        updatedAt: SEEN,
      }));
    db.knowledgePage.findMany
      .mockResolvedValueOnce(batch(1, PUBLISH_ALL_BATCH))
      .mockResolvedValueOnce(batch(PUBLISH_ALL_BATCH + 1, 3));
    publish.publishKnowledgePageCommand.mockResolvedValue({
      success: true,
      changed: false,
    });
    const result = await publishAllApprovedCommand({
      orgId: 'org-1',
      actorId: 'u1',
    });
    expect(result.unchanged).toBe(PUBLISH_ALL_BATCH + 3);
    expect(db.knowledgePage.findMany).toHaveBeenCalledTimes(2);
    expect(db.knowledgePage.findMany.mock.calls[1][0].where.id).toEqual({
      gt: PUBLISH_ALL_BATCH,
    });
  });
});
