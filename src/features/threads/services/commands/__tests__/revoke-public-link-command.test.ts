import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revokePublicLinkCommand } from '../revoke-public-link-command';

const mockDb = vi.hoisted(() => ({
  threadPublicLink: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));

const BASE_INPUT = {
  threadId: 'thread-1',
  currentUserId: 'user-1',
  organizationId: 'org-1',
};

describe('revokePublicLinkCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when link not found', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue(null);

    const result = await revokePublicLinkCommand(BASE_INPUT);

    expect(result).toEqual({ success: false, error: 'Public link not found' });
  });

  it('returns error when organization does not match', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      id: 1,
      createdByUserId: 'user-1',
      thread: { organizationId: 'other-org' },
    });

    const result = await revokePublicLinkCommand(BASE_INPUT);

    expect(result).toEqual({ success: false, error: 'Access denied' });
  });

  it('returns error when user is not the owner', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      id: 1,
      createdByUserId: 'other-user',
      thread: { organizationId: 'org-1' },
    });

    const result = await revokePublicLinkCommand(BASE_INPUT);

    expect(result).toEqual({
      success: false,
      error: 'Only the link creator can revoke it',
    });
  });

  it('deletes link when user is owner and org matches', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      id: 1,
      createdByUserId: 'user-1',
      thread: { organizationId: 'org-1' },
    });
    mockDb.threadPublicLink.delete.mockResolvedValue({});

    const result = await revokePublicLinkCommand(BASE_INPUT);

    expect(result).toEqual({ success: true });
    expect(mockDb.threadPublicLink.delete).toHaveBeenCalledWith({
      where: { threadId: 'thread-1' },
    });
  });
});
