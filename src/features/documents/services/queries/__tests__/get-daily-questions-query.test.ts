import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    message: { findMany: mockFindMany },
  },
}));

import { getDailyQuestionsQuery } from '../get-daily-questions-query';

const ORG_ID = 'org-abc';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getDailyQuestionsQuery', () => {
  it('returns one entry per day over the requested period (days + 1 including today)', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await getDailyQuestionsQuery(ORG_ID, 7);
    expect(result).toHaveLength(8);
  });

  it('returns zero counts when no messages', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await getDailyQuestionsQuery(ORG_ID, 7);
    expect(result.every((d) => d.count === 0)).toBe(true);
  });

  it('counts messages per day correctly', async () => {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);

    mockFindMany.mockResolvedValue([
      { createdAt: new Date(`${todayKey}T10:00:00Z`) },
      { createdAt: new Date(`${todayKey}T14:00:00Z`) },
    ]);

    const result = await getDailyQuestionsQuery(ORG_ID, 30);
    const todayEntry = result.find((d) => d.date === todayKey);
    expect(todayEntry?.count).toBe(2);
  });

  it('filters only USER role messages', async () => {
    mockFindMany.mockResolvedValue([]);
    await getDailyQuestionsQuery(ORG_ID, 30);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: 'USER' }),
      }),
    );
  });

  it('scopes by orgId via thread.organizationId', async () => {
    mockFindMany.mockResolvedValue([]);
    await getDailyQuestionsQuery(ORG_ID, 30);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          thread: expect.objectContaining({ organizationId: ORG_ID }),
        }),
      }),
    );
  });

  it('returns entries with date strings in YYYY-MM-DD format', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await getDailyQuestionsQuery(ORG_ID, 5);
    expect(result.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
  });
});
