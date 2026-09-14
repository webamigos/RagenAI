import type { Mock } from 'vitest';
import { ThreadEncryptionService } from './thread-encryption.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import * as threadEncryption from '@ragenai/crypto';

vi.mock('@ragenai/crypto', async () => ({
  // Partial, and merged: the two modules this file used to stub are one
  // package now, so separate vi.mock calls would silently overwrite each
  // other, and a full mock would stub the whole envelope to steer a few
  // functions.
  ...(await vi.importActual<typeof import('@ragenai/crypto')>(
    '@ragenai/crypto',
  )),
  isEncryptionEnabled: vi.fn(),
  generateThreadKey: vi.fn(),
  encryptContent: vi.fn(),
}));

describe('ThreadEncryptionService', () => {
  function makeService(
    overrides: {
      thread?: Partial<Record<string, Mock>>;
      organization?: Partial<Record<string, Mock>>;
    } = {},
  ) {
    const prisma = {
      client: {
        thread: {
          findMany: vi.fn().mockResolvedValue([]),
          ...overrides.thread,
        },
        organization: {
          findMany: vi.fn().mockResolvedValue([]),
          ...overrides.organization,
        },
        message: { update: vi.fn() },
        $transaction: vi
          .fn()
          .mockImplementation((fn: (tx: unknown) => unknown) =>
            fn({
              message: { update: vi.fn() },
              thread: { update: vi.fn() },
            }),
          ),
      },
    } as unknown as PrismaService;

    return { service: new ThreadEncryptionService(prisma), prisma };
  }

  afterEach(() => vi.clearAllMocks());

  describe('encryptThreads', () => {
    it('short-circuits when encryption is disabled', async () => {
      (threadEncryption.isEncryptionEnabled as Mock).mockReturnValue(false);
      const { service, prisma } = makeService();

      const result = await service.encryptThreads('org-1');

      expect(result).toEqual({
        success: false,
        threadsProcessed: 0,
        messagesEncrypted: 0,
        errors: 0,
        errorMessage: 'Encryption is not enabled (AWS_KMS_KEY_ID not set)',
      });
      expect(prisma.client.thread.findMany).not.toHaveBeenCalled();
    });

    it('encrypts each unencrypted thread once and stops when none remain', async () => {
      (threadEncryption.isEncryptionEnabled as Mock).mockReturnValue(true);
      (threadEncryption.generateThreadKey as Mock).mockResolvedValue({
        plaintextDek: Buffer.from('key'),
        encryptedDek: 'enc-dek',
      });
      (threadEncryption.encryptContent as Mock).mockReturnValue('cipher');

      const findMany = vi
        .fn()
        .mockResolvedValueOnce([
          { id: 't1', messages: [{ id: 'm1', content: 'hi' }] },
        ])
        .mockResolvedValueOnce([]);

      const { service } = makeService({ thread: { findMany } as never });

      const result = await service.encryptThreads('org-1');

      expect(result).toEqual({
        success: true,
        threadsProcessed: 1,
        messagesEncrypted: 1,
        errors: 0,
      });
    });
  });

  describe('encryptAllThreads', () => {
    it('aggregates results across every organization', async () => {
      (threadEncryption.isEncryptionEnabled as Mock).mockReturnValue(true);
      const { service, prisma } = makeService({
        organization: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]),
        } as never,
      });
      // Both orgs have no unencrypted threads.
      (prisma.client.thread.findMany as Mock).mockResolvedValue([]);

      const result = await service.encryptAllThreads();

      expect(result).toEqual({
        success: true,
        threadsProcessed: 0,
        messagesEncrypted: 0,
        errors: 0,
      });
      expect(prisma.client.organization.findMany).toHaveBeenCalled();
    });
  });
});
