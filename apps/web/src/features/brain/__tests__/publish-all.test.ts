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
      { publicId: 'p1', updatedAt: SEEN },
      { publicId: 'p2', updatedAt: SEEN },
      { publicId: 'p3', updatedAt: SEEN },
      { publicId: 'p4', updatedAt: SEEN },
    ]);
    publish.publishKnowledgePageCommand
      .mockResolvedValueOnce({ success: true, changed: true })
      .mockResolvedValueOnce({ success: true, changed: false })
      .mockResolvedValueOnce({ success: false, error: 'owner-required' })
      .mockResolvedValueOnce({ success: false, error: 'owner-required' });
    await expect(
      publishAllApprovedCommand({ orgId: 'org-1', actorId: 'u1' }),
    ).resolves.toEqual({
      queued: 1,
      unchanged: 1,
      refused: { 'owner-required': 2 },
    });
    expect(db.knowledgePage.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      status: 'APPROVED',
    });
    expect(publish.publishKnowledgePageCommand).toHaveBeenCalledWith({
      orgId: 'org-1',
      actorId: 'u1',
      publicId: 'p1',
      expectedUpdatedAt: SEEN.toISOString(),
    });
  });
});
