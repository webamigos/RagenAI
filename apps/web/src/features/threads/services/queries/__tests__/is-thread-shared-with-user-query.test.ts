import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
vi.mock('@ragenai/prisma-client', () => ({
  default: { threadShare: { findUnique } },
}));

import { isThreadSharedWithUserQuery } from '../is-thread-shared-with-user-query';

beforeEach(() => findUnique.mockReset());

describe('isThreadSharedWithUserQuery', () => {
  it('looks the share up by the (thread, user) pair', async () => {
    findUnique.mockResolvedValue({ id: 1 });
    expect(await isThreadSharedWithUserQuery('t1', 'u2')).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { threadId_userId: { threadId: 't1', userId: 'u2' } },
      select: { id: true },
    });
  });

  it('is false without a share row', async () => {
    findUnique.mockResolvedValue(null);
    expect(await isThreadSharedWithUserQuery('t1', 'u3')).toBe(false);
  });
});
