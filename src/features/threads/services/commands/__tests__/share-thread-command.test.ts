import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB
const mockFindFirst = vi.fn();
const mockCount = vi.fn();
const mockDeleteMany = vi.fn();
const mockFindMany = vi.fn();
const mockCreateMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mockTransaction(fn),
  },
}));

import { shareThreadCommand } from '../share-thread-command';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const THREAD_ID = 'thread-internal-id';
const THREAD_PUBLIC_ID = 'thread-pub-id';

describe('shareThreadCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          member: { count: mockCount },
          threadShare: {
            deleteMany: mockDeleteMany,
            findMany: mockFindMany,
            createMany: mockCreateMany,
          },
        };
        return fn(tx);
      },
    );
  });

  it('returns error when thread is not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await shareThreadCommand({
      threadPublicId: THREAD_PUBLIC_ID,
      recipientUserIds: ['user-2'],
      organizationId: ORG_ID,
      currentUserId: USER_ID,
    });

    expect(result).toEqual({ success: false, error: 'Thread not found' });
  });

  it('returns error when user is not the thread owner', async () => {
    mockFindFirst.mockResolvedValue({
      id: THREAD_ID,
      visitorId: 'other-user',
    });

    const result = await shareThreadCommand({
      threadPublicId: THREAD_PUBLIC_ID,
      recipientUserIds: ['user-2'],
      organizationId: ORG_ID,
      currentUserId: USER_ID,
    });

    expect(result).toEqual({
      success: false,
      error: 'Only the thread creator can share it',
    });
  });

  it('returns error when recipients are not org members', async () => {
    mockFindFirst.mockResolvedValue({ id: THREAD_ID, visitorId: USER_ID });
    mockCount.mockResolvedValue(0); // No matching members

    const result = await shareThreadCommand({
      threadPublicId: THREAD_PUBLIC_ID,
      recipientUserIds: ['user-2', 'user-3'],
      organizationId: ORG_ID,
      currentUserId: USER_ID,
    });

    expect(result).toEqual({
      success: false,
      error: 'Some recipients are not members of this organization',
    });
  });

  it('filters out self-sharing', async () => {
    mockFindFirst.mockResolvedValue({ id: THREAD_ID, visitorId: USER_ID });
    // Only user-2 should be validated (user-1 is filtered out)
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([]);

    const result = await shareThreadCommand({
      threadPublicId: THREAD_PUBLIC_ID,
      recipientUserIds: [USER_ID, 'user-2'],
      organizationId: ORG_ID,
      currentUserId: USER_ID,
    });

    expect(result).toEqual({ success: true });
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ['user-2'] },
        }),
      }),
    );
  });

  it('creates new shares and deletes removed ones in a transaction', async () => {
    mockFindFirst.mockResolvedValue({ id: THREAD_ID, visitorId: USER_ID });
    mockCount.mockResolvedValue(2);
    mockFindMany.mockResolvedValue([{ userId: 'user-2' }]); // user-2 already shared

    const result = await shareThreadCommand({
      threadPublicId: THREAD_PUBLIC_ID,
      recipientUserIds: ['user-2', 'user-3'],
      organizationId: ORG_ID,
      currentUserId: USER_ID,
    });

    expect(result).toEqual({ success: true });
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        threadId: THREAD_ID,
        userId: { notIn: ['user-2', 'user-3'] },
      },
    });
    // Should only create share for user-3 (user-2 already exists)
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        {
          threadId: THREAD_ID,
          userId: 'user-3',
          sharedByUserId: USER_ID,
        },
      ],
    });
  });

  it('handles empty recipient list (unshare all)', async () => {
    mockFindFirst.mockResolvedValue({ id: THREAD_ID, visitorId: USER_ID });

    const result = await shareThreadCommand({
      threadPublicId: THREAD_PUBLIC_ID,
      recipientUserIds: [],
      organizationId: ORG_ID,
      currentUserId: USER_ID,
    });

    expect(result).toEqual({ success: true });
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        threadId: THREAD_ID,
        userId: { notIn: [] },
      },
    });
  });
});
