import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    notification: { findMany: mockFindMany },
  },
}));

const { getNotificationsQuery } = await import('../get-notifications-query');

beforeEach(() => vi.clearAllMocks());

const makeNotif = (overrides = {}) => ({
  publicId: 'pub-1',
  type: 'DOCUMENT_SHARED',
  isRead: false,
  title: 'Test',
  body: null,
  resourceUrl: null,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

describe('getNotificationsQuery', () => {
  it('filters by userId and organizationId', async () => {
    mockFindMany.mockResolvedValue([makeNotif()]);

    await getNotificationsQuery({ userId: 'u1', organizationId: 'o1' });

    const call = mockFindMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ userId: 'u1', organizationId: 'o1' });
  });

  it('filters by isRead when provided', async () => {
    mockFindMany.mockResolvedValue([]);

    await getNotificationsQuery({
      userId: 'u1',
      organizationId: 'o1',
      isRead: true,
    });

    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.isRead).toBe(true);
  });

  it('returns nextCursor when more items exist beyond limit', async () => {
    const items = Array.from({ length: 21 }, (_, i) =>
      makeNotif({ publicId: `pub-${i}` }),
    );
    mockFindMany.mockResolvedValue(items);

    const result = await getNotificationsQuery({
      userId: 'u1',
      organizationId: 'o1',
      limit: 20,
    });

    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe('pub-19');
  });

  it('returns nextCursor null when no more items', async () => {
    mockFindMany.mockResolvedValue([makeNotif()]);

    const result = await getNotificationsQuery({
      userId: 'u1',
      organizationId: 'o1',
      limit: 20,
    });

    expect(result.nextCursor).toBeNull();
  });
});
