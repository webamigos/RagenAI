import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    message: { findMany: mockFindMany },
  },
}));

import { getNegativeQaQuery } from '../get-negative-qa-query';

const ORG_ID = 'org-abc';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getNegativeQaQuery', () => {
  it('returns empty array when no negative messages', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await getNegativeQaQuery(ORG_ID, 30);
    expect(result).toEqual([]);
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

  it('returns max 10 items', async () => {
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

    const result = await getNegativeQaQuery(ORG_ID, 30);

    expect(result[0]).toEqual({
      messageId: 'msg-1',
      threadId: 'thread-1',
      threadTitle: 'My thread',
      createdAt: createdAt.toISOString(),
    });
  });
});
