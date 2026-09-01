import { ThreadEncryptionService } from './thread-encryption.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import * as threadEncryption from '../crypto/thread-encryption.js';

jest.mock('../crypto/thread-encryption.js', () => ({
  isEncryptionEnabled: jest.fn(),
  generateThreadKey: jest.fn(),
  encryptContent: jest.fn(),
}));

describe('ThreadEncryptionService', () => {
  function makeService(
    overrides: {
      thread?: Partial<Record<string, jest.Mock>>;
      organization?: Partial<Record<string, jest.Mock>>;
    } = {},
  ) {
    const prisma = {
      client: {
        thread: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.thread,
        },
        organization: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.organization,
        },
        message: { update: jest.fn() },
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: unknown) => unknown) =>
            fn({
              message: { update: jest.fn() },
              thread: { update: jest.fn() },
            }),
          ),
      },
    } as unknown as PrismaService;

    return { service: new ThreadEncryptionService(prisma), prisma };
  }

  afterEach(() => jest.clearAllMocks());

  describe('encryptThreads', () => {
    it('short-circuits when encryption is disabled', async () => {
      (threadEncryption.isEncryptionEnabled as jest.Mock).mockReturnValue(
        false,
      );
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
      (threadEncryption.isEncryptionEnabled as jest.Mock).mockReturnValue(true);
      (threadEncryption.generateThreadKey as jest.Mock).mockResolvedValue({
        plaintextDek: Buffer.from('key'),
        encryptedDek: 'enc-dek',
      });
      (threadEncryption.encryptContent as jest.Mock).mockReturnValue('cipher');

      const findMany = jest
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
      (threadEncryption.isEncryptionEnabled as jest.Mock).mockReturnValue(true);
      const { service, prisma } = makeService({
        organization: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]),
        } as never,
      });
      // Both orgs have no unencrypted threads.
      (prisma.client.thread.findMany as jest.Mock).mockResolvedValue([]);

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
