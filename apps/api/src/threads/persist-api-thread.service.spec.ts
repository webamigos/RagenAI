const mockIsEncryptionEnabled = vi.fn();
const mockGenerateThreadKey = vi.fn();
const mockEncryptContent = vi.fn();
const mockDecryptThreadKey = vi.fn();

vi.mock('@ragenai/crypto', async () => ({
  // Partial, and merged: the two modules this file used to stub are one
  // package now, so separate vi.mock calls would silently overwrite each
  // other, and a full mock would stub the whole envelope to steer a few
  // functions.
  ...(await vi.importActual<typeof import('@ragenai/crypto')>(
    '@ragenai/crypto',
  )),
  isEncryptionEnabled: () => mockIsEncryptionEnabled(),
  generateThreadKey: () => mockGenerateThreadKey(),
  encryptContent: (content: string, dek: Buffer) =>
    mockEncryptContent(content, dek),
  decryptThreadKey: (encryptedDek: string) =>
    mockDecryptThreadKey(encryptedDek),
}));

import type { Mock } from 'vitest';
import { PersistApiThreadService } from './persist-api-thread.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('PersistApiThreadService', () => {
  function makeService(
    overrides: {
      thread?: Partial<Record<string, Mock>>;
      message?: Partial<Record<string, Mock>>;
      retrieval?: Partial<Record<string, Mock>>;
    } = {},
  ) {
    const threadOps = {
      create: vi.fn().mockResolvedValue({ id: 'thread-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'thread-1' }),
      findFirstOrThrow: vi.fn().mockResolvedValue({ encryptedDek: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.thread,
    };
    const messageOps = {
      create: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      ...overrides.message,
    };
    const retrievalOps = {
      createMany: vi.fn().mockReturnValue('retrievals'),
      ...overrides.retrieval,
    };
    const citationOps = { createMany: vi.fn().mockReturnValue('citations') };
    const transaction = vi.fn().mockResolvedValue([]);
    const prisma = {
      client: {
        thread: threadOps,
        message: messageOps,
        documentRetrieval: retrievalOps,
        documentCitation: citationOps,
        $transaction: transaction,
      },
    } as unknown as PrismaService;
    return {
      service: new PersistApiThreadService(prisma),
      threadOps,
      messageOps,
      retrievalOps,
      citationOps,
      transaction,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
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
        message: { create: vi.fn().mockRejectedValue(new Error('db down')) },
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
        message: { create: vi.fn().mockRejectedValue(new Error('db down')) },
        thread: {
          delete: vi.fn().mockRejectedValue(new Error('cleanup failed')),
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
        expect(threadOps.findFirstOrThrow).toHaveBeenCalledWith({
          where: { id: 'thread-1', organizationId: 'org-1' },
          select: { encryptedDek: true },
        });
        expect(threadOps.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'thread-1',
            organizationId: 'org-1',
            encryptedDek: null,
          },
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
            findFirstOrThrow: vi
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
            findFirstOrThrow: vi
              .fn()
              .mockResolvedValueOnce({ encryptedDek: null })
              .mockResolvedValueOnce({ encryptedDek: 'winner-wrapped-dek' }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        });

        await service.createApiThread({
          orgId: 'org-1',
          userId: 'user-1',
          projectId: 'proj-1',
          question: 'Question',
        });

        expect(threadOps.findFirstOrThrow).toHaveBeenCalledTimes(2);
        expect(threadOps.findFirstOrThrow).toHaveBeenLastCalledWith({
          where: { id: 'thread-1', organizationId: 'org-1' },
          select: { encryptedDek: true },
        });
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
            findFirstOrThrow: vi
              .fn()
              .mockResolvedValueOnce({ encryptedDek: null })
              .mockResolvedValueOnce({ encryptedDek: null }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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

  describe('recording what the turn retrieved (A2b)', () => {
    const create = async (service: PersistApiThreadService) =>
      (await service.createApiThread({
        orgId: 'org-1',
        userId: 'user-1',
        projectId: 'proj-1',
        question: 'Question',
      }))!;

    it('writes ranked retrievals and only the cited file as a citation', async () => {
      const { service, retrievalOps, citationOps, transaction } = makeService();
      const thread = await create(service);

      await thread.saveAssistantMessage('See [2].', null, [
        { fileId: 'a', fileName: 'alpha.pdf', snippet: 'quote a' },
        { fileId: 'b', fileName: 'beta.pdf' },
      ]);

      expect(retrievalOps.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            fileId: 'a',
            rank: 1,
            snippet: 'quote a',
            messageId: 'msg-1',
            orgId: 'org-1',
          }),
          expect.objectContaining({ fileId: 'b', rank: 2, snippet: null }),
        ],
        skipDuplicates: true,
      });
      expect(citationOps.createMany).toHaveBeenCalledWith({
        data: [{ messageId: 'msg-1', fileId: 'b', orgId: 'org-1' }],
        skipDuplicates: true,
      });
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('records nothing when no retrieval is given or it is empty', async () => {
      const { service, transaction } = makeService();
      const thread = await create(service);

      await thread.saveAssistantMessage('Answer');
      await thread.saveAssistantMessage('Answer', null, []);

      expect(transaction).not.toHaveBeenCalled();
    });

    it('stores the snippet under the thread key, like the message', async () => {
      mockIsEncryptionEnabled.mockReturnValue(true);
      mockGenerateThreadKey.mockResolvedValue({
        plaintextDek: Buffer.from('dek'),
        encryptedDek: 'enc-dek',
      });
      mockEncryptContent.mockImplementation((c: string) => `enc(${c})`);
      const { service, retrievalOps } = makeService();
      const thread = await create(service);

      await thread.saveAssistantMessage('Answer', null, [
        { fileId: 'a', fileName: 'a.pdf', snippet: 'secret quote' },
      ]);

      const rows = retrievalOps.createMany.mock.calls[0][0].data;
      expect(rows[0].snippet).toBe('enc(secret quote)');
    });

    it('does not throw when recording fails; the answer is already saved', async () => {
      const { service, messageOps, transaction } = makeService();
      transaction.mockRejectedValue(new Error('db down'));
      const thread = await create(service);

      await expect(
        thread.saveAssistantMessage('Answer', null, [
          { fileId: 'a', fileName: 'a.pdf' },
        ]),
      ).resolves.toBeUndefined();
      // user message + assistant message
      expect(messageOps.create).toHaveBeenCalledTimes(2);
    });

    it('records nothing when the answer itself could not be saved', async () => {
      const { service, messageOps, transaction } = makeService();
      const thread = await create(service);
      messageOps.create.mockRejectedValueOnce(new Error('db down'));

      await thread.saveAssistantMessage('Answer', null, [
        { fileId: 'a', fileName: 'a.pdf' },
      ]);

      expect(transaction).not.toHaveBeenCalled();
    });
  });
});
