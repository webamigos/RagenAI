/* eslint-disable @typescript-eslint/unbound-method */
import bcrypt from 'bcrypt';
import { ThreadSharingService } from './thread-sharing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

jest.mock('../crypto/decrypt-messages.js', () => ({
  decryptMessageContents: jest.fn((messages: unknown) =>
    Promise.resolve(messages),
  ),
}));

describe('ThreadSharingService', () => {
  function makeService(
    overrides: {
      thread?: Partial<Record<string, jest.Mock>>;
      threadShare?: Partial<Record<string, jest.Mock>>;
      threadPublicLink?: Partial<Record<string, jest.Mock>>;
      member?: Partial<Record<string, jest.Mock>>;
      tx?: unknown;
    } = {},
  ) {
    const txDefault = {
      member: { count: jest.fn().mockResolvedValue(0) },
      threadShare: {
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
    };

    const prisma = {
      client: {
        thread: { findFirst: jest.fn(), ...overrides.thread },
        threadShare: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.threadShare,
        },
        threadPublicLink: {
          findUnique: jest.fn(),
          create: jest.fn(),
          delete: jest.fn(),
          findMany: jest.fn(),
          ...overrides.threadPublicLink,
        },
        member: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.member,
        },
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: unknown) => unknown) =>
            fn(overrides.tx ?? txDefault),
          ),
      },
    } as unknown as PrismaService;

    const notifications = {
      create: jest.fn(),
    } as unknown as NotificationsService;

    return {
      service: new ThreadSharingService(prisma, notifications),
      prisma,
      notifications,
    };
  }

  describe('shareThread', () => {
    it('rejects when the thread is not found', async () => {
      const { service } = makeService({
        thread: { findFirst: jest.fn().mockResolvedValue(null) } as never,
      });

      const result = await service.shareThread({
        threadId: 't1',
        recipientUserIds: ['u2'],
        organizationId: 'org-1',
        currentUserId: 'u1',
      });

      expect(result).toEqual({ success: false, error: 'Thread not found' });
    });

    it('rejects when the caller is not the thread owner', async () => {
      const { service } = makeService({
        thread: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 't1', visitorId: 'someone-else' }),
        } as never,
      });

      const result = await service.shareThread({
        threadId: 't1',
        recipientUserIds: ['u2'],
        organizationId: 'org-1',
        currentUserId: 'u1',
      });

      expect(result).toEqual({
        success: false,
        error: 'Only the thread creator can share it',
      });
    });

    it('shares with valid org members and notifies them', async () => {
      const tx = {
        member: { count: jest.fn().mockResolvedValue(1) },
        threadShare: {
          deleteMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          createMany: jest.fn(),
        },
      };
      const { service, notifications } = makeService({
        thread: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 't1', visitorId: 'u1', title: 'Hi' }),
        } as never,
        tx,
      });

      const result = await service.shareThread({
        threadId: 't1',
        recipientUserIds: ['u2'],
        organizationId: 'org-1',
        currentUserId: 'u1',
      });

      expect(result).toEqual({ success: true });
      expect(tx.threadShare.createMany).toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u2',
          type: 'THREAD_SHARED_NEW_MESSAGE',
        }),
      );
    });
  });

  describe('createPublicLink', () => {
    it('rejects when a link already exists', async () => {
      const { service } = makeService({
        thread: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', visitorId: 'u1' }),
        } as never,
        threadPublicLink: {
          findUnique: jest.fn().mockResolvedValue({ id: 1 }),
        } as never,
      });

      const result = await service.createPublicLink({
        threadId: 't1',
        organizationId: 'org-1',
        currentUserId: 'u1',
        expiresAt: null,
      });

      expect(result).toEqual({
        success: false,
        error: 'Public link already exists. Revoke it first.',
      });
    });

    it('hashes the password before persisting', async () => {
      const hashSpy = jest.spyOn(bcrypt, 'hash');
      const { service, prisma } = makeService({
        thread: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', visitorId: 'u1' }),
        } as never,
        threadPublicLink: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ publicId: 'pub-1' }),
        } as never,
      });

      const result = await service.createPublicLink({
        threadId: 't1',
        organizationId: 'org-1',
        currentUserId: 'u1',
        expiresAt: null,
        password: 'secret',
      });

      expect(result).toEqual({ success: true, publicId: 'pub-1' });
      expect(hashSpy).toHaveBeenCalledWith('secret', 10);
      expect(prisma.client.threadPublicLink.create).toHaveBeenCalled();
    });
  });

  describe('revokePublicLink', () => {
    it('denies access when the link belongs to a different org', async () => {
      const { service } = makeService({
        threadPublicLink: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1,
            createdByUserId: 'u1',
            thread: { organizationId: 'other-org' },
          }),
        } as never,
      });

      const result = await service.revokePublicLink({
        threadId: 't1',
        currentUserId: 'u1',
        organizationId: 'org-1',
      });

      expect(result).toEqual({ success: false, error: 'Access denied' });
    });
  });

  describe('getPublicThread', () => {
    it('returns not_found for a missing link', async () => {
      const { service } = makeService({
        threadPublicLink: {
          findUnique: jest.fn().mockResolvedValue(null),
        } as never,
      });

      const result = await service.getPublicThread({ publicId: 'missing' });
      expect(result).toEqual({ status: 'not_found' });
    });

    it('requires a password when one is set and not yet verified', async () => {
      const { service } = makeService({
        threadPublicLink: {
          findUnique: jest.fn().mockResolvedValue({
            expiresAt: null,
            passwordHash: 'hashed',
            createdBy: { name: 'Alice' },
            thread: { title: 'Hi', encryptedDek: null, messages: [] },
          }),
        } as never,
      });

      const result = await service.getPublicThread({ publicId: 'p1' });
      expect(result).toEqual({ status: 'password_required' });
    });

    it('returns messages when no password is required', async () => {
      const { service } = makeService({
        threadPublicLink: {
          findUnique: jest.fn().mockResolvedValue({
            expiresAt: null,
            passwordHash: null,
            createdBy: { name: 'Alice' },
            thread: {
              title: 'Hi',
              encryptedDek: null,
              messages: [{ role: 'USER', content: 'hello' }],
            },
          }),
        } as never,
      });

      const result = await service.getPublicThread({ publicId: 'p1' });
      expect(result).toEqual({
        status: 'ok',
        title: 'Hi',
        messages: [{ role: 'USER', content: 'hello' }],
        createdByName: 'Alice',
      });
    });
  });
});
