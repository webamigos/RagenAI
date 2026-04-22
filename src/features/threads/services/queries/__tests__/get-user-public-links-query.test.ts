import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserPublicLinksQuery } from '../get-user-public-links-query';

const mockDb = vi.hoisted(() => ({
  threadPublicLink: {
    findMany: vi.fn(),
  },
}));

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));

describe('getUserPublicLinksQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no links', async () => {
    mockDb.threadPublicLink.findMany.mockResolvedValue([]);

    const result = await getUserPublicLinksQuery('user-1');

    expect(result).toEqual([]);
  });

  it('returns links scoped to userId', async () => {
    const now = new Date();
    mockDb.threadPublicLink.findMany.mockResolvedValue([
      {
        publicId: 'pub-1',
        threadId: 'thread-1',
        expiresAt: null,
        passwordHash: null,
        createdAt: now,
        thread: { title: 'My Thread' },
      },
    ]);

    const result = await getUserPublicLinksQuery('user-1');

    expect(mockDb.threadPublicLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdByUserId: 'user-1' },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      publicId: 'pub-1',
      threadId: 'thread-1',
      threadTitle: 'My Thread',
      expiresAt: null,
      hasPassword: false,
      createdAt: now.toISOString(),
    });
  });

  it('sets hasPassword true when passwordHash is set', async () => {
    mockDb.threadPublicLink.findMany.mockResolvedValue([
      {
        publicId: 'pub-1',
        threadId: 'thread-1',
        expiresAt: null,
        passwordHash: 'some-hash',
        createdAt: new Date(),
        thread: { title: null },
      },
    ]);

    const result = await getUserPublicLinksQuery('user-1');

    expect(result[0].hasPassword).toBe(true);
  });
});
