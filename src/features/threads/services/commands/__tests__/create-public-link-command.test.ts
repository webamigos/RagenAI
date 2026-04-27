import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPublicLinkCommand } from '../create-public-link-command';

const mockDb = vi.hoisted(() => ({
  thread: {
    findFirst: vi.fn(),
  },
  threadPublicLink: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));
vi.mock('bcrypt', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed_pw') },
}));

describe('createPublicLinkCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when thread not found', async () => {
    mockDb.thread.findFirst.mockResolvedValue(null);

    const result = await createPublicLinkCommand({
      threadId: 'thread-1',
      organizationId: 'org-1',
      currentUserId: 'user-1',
      expiresAt: null,
    });

    expect(result).toEqual({ success: false, error: 'Thread not found' });
  });

  it('returns error when user is not the thread owner', async () => {
    mockDb.thread.findFirst.mockResolvedValue({
      id: 'thread-1',
      visitorId: 'other-user',
    });

    const result = await createPublicLinkCommand({
      threadId: 'thread-1',
      organizationId: 'org-1',
      currentUserId: 'user-1',
      expiresAt: null,
    });

    expect(result).toEqual({
      success: false,
      error: 'Only the thread owner can create a public link',
    });
  });

  it('returns error when link already exists', async () => {
    mockDb.thread.findFirst.mockResolvedValue({
      id: 'thread-1',
      visitorId: 'user-1',
    });
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      publicId: 'existing-id',
    });

    const result = await createPublicLinkCommand({
      threadId: 'thread-1',
      organizationId: 'org-1',
      currentUserId: 'user-1',
      expiresAt: null,
    });

    expect(result).toEqual({
      success: false,
      error: 'Public link already exists. Revoke it first.',
    });
  });

  it('creates link without password', async () => {
    mockDb.thread.findFirst.mockResolvedValue({
      id: 'thread-1',
      visitorId: 'user-1',
    });
    mockDb.threadPublicLink.findUnique.mockResolvedValue(null);
    mockDb.threadPublicLink.create.mockResolvedValue({
      publicId: 'new-public-id',
    });

    const result = await createPublicLinkCommand({
      threadId: 'thread-1',
      organizationId: 'org-1',
      currentUserId: 'user-1',
      expiresAt: null,
    });

    expect(result).toEqual({ success: true, publicId: 'new-public-id' });
    expect(mockDb.threadPublicLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: null }),
      }),
    );
  });

  it('hashes password when provided', async () => {
    mockDb.thread.findFirst.mockResolvedValue({
      id: 'thread-1',
      visitorId: 'user-1',
    });
    mockDb.threadPublicLink.findUnique.mockResolvedValue(null);
    mockDb.threadPublicLink.create.mockResolvedValue({
      publicId: 'new-public-id',
    });

    await createPublicLinkCommand({
      threadId: 'thread-1',
      organizationId: 'org-1',
      currentUserId: 'user-1',
      expiresAt: null,
      password: 'secret',
    });

    expect(mockDb.threadPublicLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: 'hashed_pw' }),
      }),
    );
  });
});
