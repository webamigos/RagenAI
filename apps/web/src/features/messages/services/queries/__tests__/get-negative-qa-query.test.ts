import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());
const mockCount = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    message: { findMany: mockFindMany, count: mockCount },
  },
}));

import { getNegativeQaQuery } from '../get-negative-qa-query';

const ORG_ID = 'org-abc';

beforeEach(() => {
  vi.clearAllMocks();
  mockCount.mockResolvedValue(0);
});

describe('getNegativeQaQuery', () => {
  it('returns empty items and total=0 when no negative messages', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    const result = await getNegativeQaQuery(ORG_ID, 30);
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('filters only rate=0 messages', async () => {
    mockFindMany.mockResolvedValue([]);
    await getNegativeQaQuery(ORG_ID, 30);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ rate: 0 }),
      }),
    );
  });

  it('scopes by orgId via thread.organizationId', async () => {
    mockFindMany.mockResolvedValue([]);
    await getNegativeQaQuery(ORG_ID, 30);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          thread: expect.objectContaining({ organizationId: ORG_ID }),
        }),
      }),
    );
  });

  it('uses skip/take for pagination', async () => {
    mockFindMany.mockResolvedValue([]);
    await getNegativeQaQuery(ORG_ID, 30, 2);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('returns max 10 items per page', async () => {
    mockFindMany.mockResolvedValue([]);
    await getNegativeQaQuery(ORG_ID, 30);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it('maps message to NegativeQaItem', async () => {
    const createdAt = new Date('2026-01-01');
    mockFindMany.mockResolvedValue([
      {
        id: 'msg-1',
        createdAt,
        thread: { id: 'thread-1', title: 'My thread' },
      },
    ]);
    mockCount.mockResolvedValue(1);

    const result = await getNegativeQaQuery(ORG_ID, 30);

    expect(result.items[0]).toEqual({
      messageId: 'msg-1',
      threadId: 'thread-1',
      threadTitle: 'My thread',
      createdAt: createdAt.toISOString(),
    });
    expect(result.total).toBe(1);
  });
});
