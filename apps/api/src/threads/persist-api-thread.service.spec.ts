const mockIsEncryptionEnabled = jest.fn();
const mockGenerateThreadKey = jest.fn();
const mockEncryptContent = jest.fn();
const mockDecryptThreadKey = jest.fn();

jest.mock('../crypto/thread-encryption.js', () => ({
  isEncryptionEnabled: () => mockIsEncryptionEnabled(),
  generateThreadKey: () => mockGenerateThreadKey(),
  encryptContent: (content: string, dek: Buffer) =>
    mockEncryptContent(content, dek),
  decryptThreadKey: (encryptedDek: string) =>
    mockDecryptThreadKey(encryptedDek),
}));

import { PersistApiThreadService } from './persist-api-thread.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('PersistApiThreadService', () => {
  function makeService(
    overrides: {
      thread?: Partial<Record<string, jest.Mock>>;
      message?: Partial<Record<string, jest.Mock>>;
    } = {},
  ) {
    const threadOps = {
      create: jest.fn().mockResolvedValue({ id: 'thread-1' }),
      delete: jest.fn().mockResolvedValue({ id: 'thread-1' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ encryptedDek: null }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...overrides.thread,
    };
    const messageOps = {
      create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      ...overrides.message,
    };
    const prisma = {
      client: { thread: threadOps, message: messageOps },
    } as unknown as PrismaService;
    return {
      service: new PersistApiThreadService(prisma),
      threadOps,
      messageOps,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEncryptionEnabled.mockReturnValue(false);
  });

  describe('createApiThread', () => {
    it('creates a thread and user message with source API', async () => {
      const { service, threadOps, messageOps } = makeService();

      const result = await service.createApiThread({
        orgId: 'org-1',
        userId: 'user-1',
        projectId: 'proj-1',
        question: 'What is the refund policy?',
      });

      expect(result).not.toBeNull();
      expect(result?.threadId).toBe('thread-1');
      expect(threadOps.create).toHaveBeenCalledTimes(1);
      const threadData = threadOps.create.mock.calls[0][0].data;
      expect(threadData.organizationId).toBe('org-1');
      expect(threadData.userId).toBe('user-1');
      expect(threadData.visitorId).toBe('user-1');
      expect(threadData.projectId).toBe('proj-1');
      expect(threadData.source).toBe('API');
      expect(threadData.title).toBe('What is the refund policy?');

      expect(messageOps.create).toHaveBeenCalledTimes(1);
      const messageData = messageOps.create.mock.calls[0][0].data;
      expect(messageData.threadId).toBe('thread-1');
      expect(messageData.content).toBe('What is the refund policy?');
      expect(messageData.role).toBe('USER');
      expect(messageData.source).toBe('API');
    });

    it('truncates titles over 100 characters', async () => {
      const { service, threadOps } = makeService();
      const longQuestion = 'A'.repeat(150);

      await service.createApiThread({
        orgId: 'org-1',
        userId: 'user-1',
        projectId: 'proj-1',
        question: longQuestion,
      });

      const threadData = threadOps.create.mock.calls[0][0].data;
      expect(threadData.title).toBe(`${'A'.repeat(100)}...`);
    });

    it('prepends chat history to the persisted user message content', async () => {
      const { service, messageOps } = makeService();

      await service.createApiThread({
        orgId: 'org-1',
        userId: 'user-1',
        projectId: 'proj-1',
        question: 'Follow-up question',
        chatHistory: 'USER: first\nASSISTANT: reply',
      });

      const messageData = messageOps.create.mock.calls[0][0].data;
      expect(messageData.content).toBe(
        'USER: first\nASSISTANT: reply\n\nUSER: Follow-up question',
      );
    });

    it('cleans up the orphan thread and returns null when message creation fails', async () => {
      const { service, threadOps } = makeService({
        message: { create: jest.fn().mockRejectedValue(new Error('db down')) },
      });

      const result = await service.createApiThread({
        orgId: 'org-1',
        userId: 'user-1',
        projectId: 'proj-1',
        question: 'Question',
      });

      expect(result).toBeNull();
      expect(threadOps.delete).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
      });
    });

    it('returns null without throwing when orphan cleanup itself fails', async () => {
      const { service } = makeService({
        message: { create: jest.fn().mockRejectedValue(new Error('db down')) },
        thread: {
          delete: jest.fn().mockRejectedValue(new Error('cleanup failed')),
        },
      });

      await expect(
        service.createApiThread({
          orgId: 'org-1',
          userId: 'user-1',
          projectId: 'proj-1',
          question: 'Question',
        }),
      ).resolves.toBeNull();
    });

    describe('encryption', () => {
      it('passes content through unencrypted when encryption is disabled', async () => {
        const { service, messageOps } = makeService();
        mockIsEncryptionEnabled.mockReturnValue(false);

        await service.createApiThread({
          orgId: 'org-1',
          userId: 'user-1',
          projectId: 'proj-1',
          question: 'Plaintext question',
        });

        expect(messageOps.create.mock.calls[0][0].data.content).toBe(
          'Plaintext question',
        );
        expect(mockGenerateThreadKey).not.toHaveBeenCalled();
      });

      it('generates a new DEK and encrypts when the thread has none yet', async () => {
        mockIsEncryptionEnabled.mockReturnValue(true);
        const plaintextDek = Buffer.from('a'.repeat(32));
        mockGenerateThreadKey.mockResolvedValue({
          encryptedDek: 'wrapped-dek',
          plaintextDek,
        });
        mockEncryptContent.mockReturnValue('cipher-text');

        const { service, threadOps, messageOps } = makeService();

        await service.createApiThread({
          orgId: 'org-1',
          userId: 'user-1',
          projectId: 'proj-1',
          question: 'Secret question',
        });

        expect(mockGenerateThreadKey).toHaveBeenCalledTimes(1);
        expect(threadOps.updateMany).toHaveBeenCalledWith({
          where: { id: 'thread-1', encryptedDek: null },
          data: { encryptedDek: 'wrapped-dek' },
        });
        expect(mockEncryptContent).toHaveBeenCalledWith(
          'Secret question',
          plaintextDek,
        );
        expect(messageOps.create.mock.calls[0][0].data.content).toBe(
          'cipher-text',
        );
      });

      it('reuses the existing DEK when the thread already has one', async () => {
        mockIsEncryptionEnabled.mockReturnValue(true);
        const existingDek = Buffer.from('b'.repeat(32));
        mockDecryptThreadKey.mockResolvedValue(existingDek);
        mockEncryptContent.mockReturnValue('cipher-text');

        const { service, threadOps } = makeService({
          thread: {
            findUniqueOrThrow: jest
              .fn()
              .mockResolvedValue({ encryptedDek: 'already-wrapped' }),
          },
        });

        await service.createApiThread({
          orgId: 'org-1',
          userId: 'user-1',
          projectId: 'proj-1',
          question: 'Question',
        });

        expect(mockDecryptThreadKey).toHaveBeenCalledWith('already-wrapped');
        expect(mockGenerateThreadKey).not.toHaveBeenCalled();
        expect(threadOps.updateMany).not.toHaveBeenCalled();
      });

      it('re-fetches the winning key when the conditional update loses the race', async () => {
        mockIsEncryptionEnabled.mockReturnValue(true);
        const loserDek = Buffer.from('c'.repeat(32));
        const winnerDek = Buffer.from('d'.repeat(32));
        mockGenerateThreadKey.mockResolvedValue({
          encryptedDek: 'loser-wrapped-dek',
          plaintextDek: loserDek,
        });
        mockDecryptThreadKey.mockResolvedValue(winnerDek);
        mockEncryptContent.mockReturnValue('cipher-text');

        const { service, threadOps } = makeService({
          thread: {
            // First call (initial check): no key yet.
            // Second call (after losing the race): the winner's key.
            findUniqueOrThrow: jest
              .fn()
              .mockResolvedValueOnce({ encryptedDek: null })
              .mockResolvedValueOnce({ encryptedDek: 'winner-wrapped-dek' }),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        });

        await service.createApiThread({
          orgId: 'org-1',
          userId: 'user-1',
          projectId: 'proj-1',
          question: 'Question',
        });

        expect(threadOps.findUniqueOrThrow).toHaveBeenCalledTimes(2);
        expect(mockDecryptThreadKey).toHaveBeenCalledWith('winner-wrapped-dek');
        expect(mockEncryptContent).toHaveBeenCalledWith('Question', winnerDek);
      });

      it('throws when the race is lost and the winner also has no key', async () => {
        mockIsEncryptionEnabled.mockReturnValue(true);
        mockGenerateThreadKey.mockResolvedValue({
          encryptedDek: 'loser-wrapped-dek',
          plaintextDek: Buffer.from('e'.repeat(32)),
        });

        const { service } = makeService({
          thread: {
            findUniqueOrThrow: jest
              .fn()
              .mockResolvedValueOnce({ encryptedDek: null })
              .mockResolvedValueOnce({ encryptedDek: null }),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        });

        // maybeEncrypt's thrown error propagates up through the outer
        // try/catch, which cleans up the orphan thread and returns null
        // rather than rethrowing — mirrors apps/web's fail-open behavior.
        const result = await service.createApiThread({
          orgId: 'org-1',
          userId: 'user-1',
          projectId: 'proj-1',
          question: 'Question',
        });

        expect(result).toBeNull();
      });
    });
  });

  describe('saveAssistantMessage', () => {
    it('persists the assistant reply with role ASSISTANT', async () => {
      const { service, messageOps } = makeService();

      const result = await service.createApiThread({
        orgId: 'org-1',
        userId: 'user-1',
        projectId: 'proj-1',
        question: 'Question',
      });

      messageOps.create.mockClear();
      await result?.saveAssistantMessage('The answer is 42.');

      expect(messageOps.create).toHaveBeenCalledTimes(1);
      const data = messageOps.create.mock.calls[0][0].data;
      expect(data.threadId).toBe('thread-1');
      expect(data.content).toBe('The answer is 42.');
      expect(data.role).toBe('ASSISTANT');
      expect(data.source).toBe('API');
    });

    it('swallows errors instead of throwing', async () => {
      const { service, messageOps } = makeService();

      const result = await service.createApiThread({
        orgId: 'org-1',
        userId: 'user-1',
        projectId: 'proj-1',
        question: 'Question',
      });

      messageOps.create.mockClear().mockRejectedValueOnce(new Error('db down'));

      await expect(
        result?.saveAssistantMessage('Answer'),
      ).resolves.toBeUndefined();
    });
  });
});
