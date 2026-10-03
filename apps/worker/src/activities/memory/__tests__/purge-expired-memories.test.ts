import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  memoryDelete: vi.fn(),
  changeDelete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../../services/db/prisma.js', () => ({
  getPrisma: () => ({
    userMemory: { deleteMany: m.memoryDelete },
    userMemoryChange: { deleteMany: m.changeDelete },
    $transaction: m.transaction,
  }),
}));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { purgeExpiredMemories } from '../purge-expired-memories.js';

beforeEach(() => {
  vi.clearAllMocks();
  m.transaction.mockResolvedValue([{ count: 3 }, { count: 7 }]);
});

describe('purgeExpiredMemories', () => {
  it('deletes memories past expiresAt and change rows older than 30 days', async () => {
    const now = new Date('2026-10-31T04:00:00Z');

    const result = await purgeExpiredMemories(now);

    expect(m.memoryDelete).toHaveBeenCalledWith({
      where: { expiresAt: { lte: now } },
    });
    expect(m.changeDelete).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-10-01T04:00:00Z') } },
    });
    expect(result).toEqual({
      memoriesDeleted: 3,
      changesDeleted: 7,
      changesOlderThan: '2026-10-01T04:00:00.000Z',
    });
  });
});
