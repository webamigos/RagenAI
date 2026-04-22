import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPublicLinkQuery } from '../get-public-link-query';

const mockDb = vi.hoisted(() => ({
  threadPublicLink: {
    findUnique: vi.fn(),
  },
}));

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));

const baseLink = {
  publicId: 'pub-1',
  threadId: 'thread-1',
  expiresAt: null,
  passwordHash: null,
  createdAt: new Date('2026-01-01'),
  createdByUserId: 'user-1',
  thread: { title: 'My Thread' },
};

describe('getPublicLinkQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when link does not exist', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue(null);

    const result = await getPublicLinkQuery('thread-1', 'user-1');

    expect(result).toBeNull();
  });

  it('returns null when createdByUserId does not match userId', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...baseLink,
      createdByUserId: 'other-user',
    });

    const result = await getPublicLinkQuery('thread-1', 'user-1');

    expect(result).toBeNull();
  });

  it('returns PublicLinkDto when createdByUserId matches userId', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue(baseLink);

    const result = await getPublicLinkQuery('thread-1', 'user-1');

    expect(result).toEqual({
      publicId: 'pub-1',
      threadId: 'thread-1',
      threadTitle: 'My Thread',
      expiresAt: null,
      hasPassword: false,
      createdAt: new Date('2026-01-01').toISOString(),
    });
  });

  it('sets hasPassword true when passwordHash is set', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...baseLink,
      passwordHash: 'hash',
    });

    const result = await getPublicLinkQuery('thread-1', 'user-1');

    expect(result?.hasPassword).toBe(true);
  });
});
