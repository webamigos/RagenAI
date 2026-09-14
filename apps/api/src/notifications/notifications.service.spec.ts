/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { Mock } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type NotificationType } from './types.js';

describe('NotificationsService', () => {
  function makeService(overrides: {
    create?: Mock;
    updateMany?: Mock;
    findMany?: Mock;
    findFirst?: Mock;
  }) {
    const prisma = {
      client: {
        notification: {
          create: overrides.create ?? vi.fn(),
          updateMany: overrides.updateMany ?? vi.fn(),
          findMany: overrides.findMany ?? vi.fn(),
          findFirst: overrides.findFirst ?? vi.fn(),
        },
      },
    } as unknown as PrismaService;
    return new NotificationsService(prisma);
  }

  const makeNotif = (overrides = {}) => ({
    publicId: 'pub-1',
    type: 'DOCUMENT_SHARED' as NotificationType,
    isRead: false,
    title: 'Test',
    body: null,
    resourceUrl: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });

  describe('create', () => {
    it('creates a notification with the given fields', async () => {
      const create = vi.fn().mockResolvedValue(makeNotif());
      const service = makeService({ create });

      const result = await service.create({
        userId: 'user-1',
        organizationId: 'org-1',
        type: 'DOCUMENT_SHARED',
        title: 'Test',
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          organizationId: 'org-1',
          type: 'DOCUMENT_SHARED',
          title: 'Test',
        }),
        select: expect.any(Object),
      });
      expect(result.publicId).toBe('pub-1');
      expect(result.isRead).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('scopes the update to userId and organizationId', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 5 });
      const service = makeService({ updateMany });

      await service.markAllAsRead({
        userId: 'user-1',
        organizationId: 'org-1',
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', organizationId: 'org-1', isRead: false },
        data: { isRead: true },
      });
    });
  });

  describe('markAsRead', () => {
    it('scopes the update to userId and organizationId (IDOR guard)', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const service = makeService({ updateMany });

      await service.markAsRead({
        publicId: 'pub-1',
        userId: 'user-1',
        organizationId: 'org-1',
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { publicId: 'pub-1', userId: 'user-1', organizationId: 'org-1' },
        data: { isRead: true },
      });
    });

    it('does not throw when the notification is not found (count 0)', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 0 });
      const service = makeService({ updateMany });

      await expect(
        service.markAsRead({
          publicId: 'pub-999',
          userId: 'user-1',
          organizationId: 'org-1',
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('getNotifications', () => {
    it('filters by userId and organizationId', async () => {
      const findMany = vi.fn().mockResolvedValue([makeNotif()]);
      const service = makeService({ findMany });

      await service.getNotifications({ userId: 'u1', organizationId: 'o1' });

      expect(findMany.mock.calls[0][0].where).toMatchObject({
        userId: 'u1',
        organizationId: 'o1',
      });
    });

    it('filters by isRead when provided', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const service = makeService({ findMany });

      await service.getNotifications({
        userId: 'u1',
        organizationId: 'o1',
        isRead: true,
      });

      expect(findMany.mock.calls[0][0].where.isRead).toBe(true);
    });

    it('returns nextCursor when more items exist beyond the limit', async () => {
      const items = Array.from({ length: 21 }, (_, i) =>
        makeNotif({ publicId: `pub-${i}` }),
      );
      const findMany = vi.fn().mockResolvedValue(items);
      const service = makeService({ findMany });

      const result = await service.getNotifications({
        userId: 'u1',
        organizationId: 'o1',
        limit: 20,
      });

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('pub-19');
    });

    it('returns a null nextCursor when there are no more items', async () => {
      const findMany = vi.fn().mockResolvedValue([makeNotif()]);
      const service = makeService({ findMany });

      const result = await service.getNotifications({
        userId: 'u1',
        organizationId: 'o1',
        limit: 20,
      });

      expect(result.nextCursor).toBeNull();
    });

    it('resolves the cursor pivot scoped to the caller before paginating', async () => {
      const findFirst = vi
        .fn()
        .mockResolvedValue({ createdAt: new Date('2026-01-05') });
      const findMany = vi.fn().mockResolvedValue([]);
      const service = makeService({ findFirst, findMany });

      await service.getNotifications({
        userId: 'u1',
        organizationId: 'o1',
        cursor: 'pub-5',
      });

      expect(findFirst).toHaveBeenCalledWith({
        where: { publicId: 'pub-5', userId: 'u1', organizationId: 'o1' },
        select: { createdAt: true },
      });
      expect(findMany.mock.calls[0][0].where.createdAt).toEqual({
        lt: new Date('2026-01-05'),
      });
    });
  });
});
