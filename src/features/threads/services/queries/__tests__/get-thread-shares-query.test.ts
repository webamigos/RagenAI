import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockThreadFindFirst = vi.fn();
const mockMemberFindMany = vi.fn();
const mockShareFindMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: { findFirst: (...args: unknown[]) => mockThreadFindFirst(...args) },
    member: { findMany: (...args: unknown[]) => mockMemberFindMany(...args) },
    threadShare: {
      findMany: (...args: unknown[]) => mockShareFindMany(...args),
    },
  },
}));

import { getThreadSharesQuery } from '../get-thread-shares-query';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const THREAD_PUBLIC_ID = 'thread-pub-id';
const THREAD_ID = 'thread-internal-id';

describe('getThreadSharesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty sharedWith when thread is not found', async () => {
    mockThreadFindFirst.mockResolvedValue(null);

    const result = await getThreadSharesQuery(
      THREAD_PUBLIC_ID,
      ORG_ID,
      USER_ID,
    );

    expect(result).toEqual({
      threadPublicId: THREAD_PUBLIC_ID,
      sharedWith: [],
    });
  });

  it('returns org members with isShared flag', async () => {
    mockThreadFindFirst.mockResolvedValue({ id: THREAD_ID });
    mockMemberFindMany.mockResolvedValue([
      {
        userId: 'user-2',
        user: {
          id: 'user-2',
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
        },
      },
      {
        userId: 'user-3',
        user: {
          id: 'user-3',
          name: 'Bob',
          email: 'bob@example.com',
          image: 'https://example.com/bob.jpg',
        },
      },
    ]);
    mockShareFindMany.mockResolvedValue([{ userId: 'user-2' }]);

    const result = await getThreadSharesQuery(
      THREAD_PUBLIC_ID,
      ORG_ID,
      USER_ID,
    );

    expect(result.sharedWith).toHaveLength(2);
    expect(result.sharedWith[0]).toEqual({
      userId: 'user-2',
      name: 'Alice',
      email: 'alice@example.com',
      image: null,
      isShared: true,
    });
    expect(result.sharedWith[1]).toEqual({
      userId: 'user-3',
      name: 'Bob',
      email: 'bob@example.com',
      image: 'https://example.com/bob.jpg',
      isShared: false,
    });
  });

  it('excludes current user from members list', async () => {
    mockThreadFindFirst.mockResolvedValue({ id: THREAD_ID });
    mockMemberFindMany.mockResolvedValue([]);
    mockShareFindMany.mockResolvedValue([]);

    await getThreadSharesQuery(THREAD_PUBLIC_ID, ORG_ID, USER_ID);

    expect(mockMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { not: USER_ID },
        }),
      }),
    );
  });
});
