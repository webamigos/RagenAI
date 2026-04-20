import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revokePublicLinkCommand } from '../revoke-public-link-command';

const mockDb = vi.hoisted(() => ({
  threadPublicLink: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));

describe('revokePublicLinkCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when link not found', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue(null);

    const result = await revokePublicLinkCommand({
      threadId: 'thread-1',
      currentUserId: 'user-1',
    });

    expect(result).toEqual({ success: false, error: 'Public link not found' });
  });

  it('returns error when user is not the owner', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      id: 1,
      createdByUserId: 'other-user',
    });

    const result = await revokePublicLinkCommand({
      threadId: 'thread-1',
      currentUserId: 'user-1',
    });

    expect(result).toEqual({
      success: false,
      error: 'Only the link creator can revoke it',
    });
  });

  it('deletes link when user is owner', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      id: 1,
      createdByUserId: 'user-1',
    });
    mockDb.threadPublicLink.delete.mockResolvedValue({});

    const result = await revokePublicLinkCommand({
      threadId: 'thread-1',
      currentUserId: 'user-1',
    });

    expect(result).toEqual({ success: true });
    expect(mockDb.threadPublicLink.delete).toHaveBeenCalledWith({
      where: { threadId: 'thread-1' },
    });
  });
});
