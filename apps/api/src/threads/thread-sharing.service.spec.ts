/* eslint-disable @typescript-eslint/unbound-method */
import type { Mock } from 'vitest';
import bcrypt from 'bcrypt';
import { ThreadSharingService } from './thread-sharing.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type NotificationsService } from '../notifications/notifications.service.js';
import { type SubscriptionsService } from '../subscriptions/subscriptions.service.js';

vi.mock('@ragenai/crypto', async () => ({
  // Partial, and merged: the two modules this file used to stub are one
  // package now, so separate vi.mock calls would silently overwrite each
  // other, and a full mock would stub the whole envelope to steer a few
  // functions.
  ...(await vi.importActual<typeof import('@ragenai/crypto')>(
    '@ragenai/crypto',
  )),
  decryptMessageContents: vi.fn((messages: unknown) =>
    Promise.resolve(messages),
  ),
}));

describe('ThreadSharingService', () => {
  function makeService(
    overrides: {
      thread?: Partial<Record<string, Mock>>;
      threadShare?: Partial<Record<string, Mock>>;
      threadPublicLink?: Partial<Record<string, Mock>>;
      member?: Partial<Record<string, Mock>>;
      tx?: unknown;
      /** `publicThreadLinks`; defaults to enabled so existing cases are unaffected. */
      featureEnabled?: boolean;
    } = {},
  ) {
    const txDefault = {
      member: { count: vi.fn().mockResolvedValue(0) },
      threadShare: {
        deleteMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn(),
      },
    };

    const prisma = {
      client: {
        thread: { findFirst: vi.fn(), ...overrides.thread },
        threadShare: {
          findMany: vi.fn().mockResolvedValue([]),
          ...overrides.threadShare,
        },
        threadPublicLink: {
          findUnique: vi.fn(),
          create: vi.fn(),
          delete: vi.fn(),
          findMany: vi.fn(),
          ...overrides.threadPublicLink,
        },
        member: {
          findMany: vi.fn().mockResolvedValue([]),
          ...overrides.member,
        },
        $transaction: vi
          .fn()
          .mockImplementation((fn: (tx: unknown) => unknown) =>
            fn(overrides.tx ?? txDefault),
          ),
      },
    } as unknown as PrismaService;

    const notifications = {
      create: vi.fn(),
    } as unknown as NotificationsService;

    const subscriptions = {
      isFeatureEnabled: vi
        .fn()
        .mockResolvedValue(overrides.featureEnabled ?? true),
    } as unknown as SubscriptionsService;

    return {
      service: new ThreadSharingService(prisma, notifications, subscriptions),
      prisma,
      notifications,
      subscriptions,
    };
  }

  describe('shareThread', () => {
    it('rejects when the thread is not found', async () => {
      const { service } = makeService({
        thread: { findFirst: vi.fn().mockResolvedValue(null) } as never,
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
          findFirst: vi
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
        member: { count: vi.fn().mockResolvedValue(1) },
        threadShare: {
          deleteMany: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
          createMany: vi.fn(),
        },
      };
      const { service, notifications } = makeService({
        thread: {
          findFirst: vi
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
    it('refuses when publicThreadLinks is disabled, without reading the thread', async () => {
      const threadFindFirst = vi.fn();
      const { service, subscriptions } = makeService({
        featureEnabled: false,
        thread: { findFirst: threadFindFirst } as never,
      });

      const result = await service.createPublicLink({
        threadId: 't1',
        organizationId: 'org-1',
        currentUserId: 'u1',
        expiresAt: null,
      });

      expect(result).toEqual({
        success: false,
        error: 'Public thread links are not enabled for your organization',
      });
      expect(threadFindFirst).not.toHaveBeenCalled();
      expect(subscriptions.isFeatureEnabled).toHaveBeenCalledWith(
        'org-1',
        'publicThreadLinks',
      );
    });

    it('rejects when a link already exists', async () => {
      const { service } = makeService({
        thread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1', visitorId: 'u1' }),
        } as never,
        threadPublicLink: {
          findUnique: vi.fn().mockResolvedValue({ id: 1 }),
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
      const hashSpy = vi.spyOn(bcrypt, 'hash');
      const { service, prisma } = makeService({
        thread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1', visitorId: 'u1' }),
        } as never,
        threadPublicLink: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ publicId: 'pub-1' }),
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
          findUnique: vi.fn().mockResolvedValue({
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
    it('returns not_found when the thread has no organization to resolve the flag against', async () => {
      // Thread.organizationId is nullable. With no org there are no settings
      // to read the flag from, so the link cannot be shown to be permitted.
      const { service, subscriptions } = makeService({
        threadPublicLink: {
          findUnique: vi.fn().mockResolvedValue({
            expiresAt: null,
            passwordHash: null,
            createdBy: { name: 'Alice' },
            thread: {
              title: 'Hi',
              encryptedDek: null,
              organizationId: null,
              messages: [{ role: 'user', content: 'secret' }],
            },
          }),
        } as never,
      });

      const result = await service.getPublicThread({ publicId: 'p1' });

      expect(result).toEqual({ status: 'not_found' });
      expect(subscriptions.isFeatureEnabled).not.toHaveBeenCalled();
    });

    it('returns not_found for a live link once publicThreadLinks is disabled', async () => {
      // Turning the feature off must close links already in circulation, and
      // must not distinguish "disabled" from "missing" — that would confirm
      // to an anonymous URL holder that the thread exists.
      const { service, subscriptions } = makeService({
        featureEnabled: false,
        threadPublicLink: {
          findUnique: vi.fn().mockResolvedValue({
            expiresAt: null,
            passwordHash: null,
            createdBy: { name: 'Alice' },
            thread: {
              title: 'Hi',
              encryptedDek: null,
              organizationId: 'org-1',
              messages: [{ role: 'user', content: 'secret' }],
            },
          }),
        } as never,
      });

      const result = await service.getPublicThread({ publicId: 'p1' });

      expect(result).toEqual({ status: 'not_found' });
      // The org comes from the thread, not a session — the caller is anonymous.
      expect(subscriptions.isFeatureEnabled).toHaveBeenCalledWith(
        'org-1',
        'publicThreadLinks',
      );
    });

    it('returns not_found for a missing link', async () => {
      const { service } = makeService({
        threadPublicLink: {
          findUnique: vi.fn().mockResolvedValue(null),
        } as never,
      });

      const result = await service.getPublicThread({ publicId: 'missing' });
      expect(result).toEqual({ status: 'not_found' });
    });

    it('requires a password when one is set and not yet verified', async () => {
      const { service } = makeService({
        threadPublicLink: {
          findUnique: vi.fn().mockResolvedValue({
            expiresAt: null,
            passwordHash: 'hashed',
            createdBy: { name: 'Alice' },
            thread: {
              title: 'Hi',
              encryptedDek: null,
              organizationId: 'org-1',
              messages: [],
            },
          }),
        } as never,
      });

      const result = await service.getPublicThread({ publicId: 'p1' });
      expect(result).toEqual({ status: 'password_required' });
    });

    it('returns messages when no password is required', async () => {
      const { service } = makeService({
        threadPublicLink: {
          findUnique: vi.fn().mockResolvedValue({
            expiresAt: null,
            passwordHash: null,
            createdBy: { name: 'Alice' },
            thread: {
              title: 'Hi',
              encryptedDek: null,
              organizationId: 'org-1',
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
