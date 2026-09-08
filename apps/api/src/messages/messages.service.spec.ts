const mockIsEncryptionEnabled = jest.fn();
const mockGenerateThreadKey = jest.fn();
const mockEncryptContent = jest.fn();
const mockDecryptThreadKey = jest.fn();

jest.mock('@ragenai/crypto', () => ({
  // Partial, and merged: the two modules this file used to stub are one
  // package now, so separate jest.mock calls would silently overwrite each
  // other, and a full mock would stub the whole envelope to steer a few
  // functions.
  ...jest.requireActual<typeof import('@ragenai/crypto')>('@ragenai/crypto'),
  isEncryptionEnabled: () => mockIsEncryptionEnabled(),
  generateThreadKey: () => mockGenerateThreadKey(),
  encryptContent: (content: string, dek: Buffer) =>
    mockEncryptContent(content, dek),
  decryptThreadKey: (encryptedDek: string) =>
    mockDecryptThreadKey(encryptedDek),
  decryptMessageContents: (messages: unknown[], encryptedDek: string | null) =>
    mockDecryptMessageContents(messages, encryptedDek),
}));

const mockDecryptMessageContents = jest.fn();

import { MessagesService } from './messages.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('MessagesService', () => {
  function makeService(
    overrides: {
      thread?: Partial<Record<string, jest.Mock>>;
      message?: Partial<Record<string, jest.Mock>>;
      project?: Partial<Record<string, jest.Mock>>;
      visitorMessages?: Partial<Record<string, jest.Mock>>;
    } = {},
  ) {
    const threadOps = {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ encryptedDek: null }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...overrides.thread,
    };
    const messageOps = {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      ...overrides.message,
    };
    const projectOps = {
      findUnique: jest.fn(),
      ...overrides.project,
    };
    const visitorMessagesOps = {
      create: jest.fn().mockResolvedValue({}),
      ...overrides.visitorMessages,
    };
    const $transaction = jest.fn().mockResolvedValue([{}, {}]);
    const prisma = {
      client: {
        thread: threadOps,
        message: messageOps,
        project: projectOps,
        visitorMessages: visitorMessagesOps,
        $transaction,
      },
    } as unknown as PrismaService;
    return { service: new MessagesService(prisma), prisma, $transaction };
  }

  beforeEach(() => {
    mockIsEncryptionEnabled.mockReset().mockReturnValue(false);
    mockGenerateThreadKey.mockReset();
    mockEncryptContent.mockReset();
    mockDecryptThreadKey.mockReset();
    mockDecryptMessageContents.mockReset();
  });

  describe('createMessageInDb / createAndStoreMessage', () => {
    it('creates a plaintext message when encryption is disabled', async () => {
      const create = jest.fn().mockResolvedValue({
        id: 'msg-1',
        role: 'USER',
        content: 'hello',
        createdAt: new Date('2026-01-01'),
        messageType: 'TEXT',
        voiceDurationSeconds: null,
        voicePlayed: false,
        attachments: null,
      });
      const { service } = makeService({ message: { create } });

      const result = await service.createAndStoreMessage({
        prompt: '  hello  ',
        threadId: 'thread-1',
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'hello' }),
        }),
      );
      expect(result.id).toBe('msg-1');
    });

    it('encrypts content using an existing thread DEK', async () => {
      mockIsEncryptionEnabled.mockReturnValue(true);
      mockDecryptThreadKey.mockResolvedValue(Buffer.from('dek'));
      mockEncryptContent.mockReturnValue('encrypted:hello');
      const create = jest.fn().mockResolvedValue({
        id: 'msg-1',
        role: 'USER',
        content: 'encrypted:hello',
        createdAt: new Date('2026-01-01'),
        messageType: 'TEXT',
        voiceDurationSeconds: null,
        voicePlayed: false,
        attachments: null,
      });
      const { service } = makeService({
        thread: {
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ encryptedDek: 'enc-dek' }),
        },
        message: { create },
      });

      await service.createAndStoreMessage({
        prompt: 'hello',
        threadId: 'thread-1',
      });

      expect(mockDecryptThreadKey).toHaveBeenCalledWith('enc-dek');
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'encrypted:hello' }),
        }),
      );
    });

    it('initializes a DEK race-safely when the thread has none yet', async () => {
      mockIsEncryptionEnabled.mockReturnValue(true);
      mockGenerateThreadKey.mockResolvedValue({
        plaintextDek: Buffer.from('fresh'),
        encryptedDek: 'fresh-enc',
      });
      mockEncryptContent.mockReturnValue('encrypted:hello');
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const findUniqueOrThrow = jest
        .fn()
        .mockResolvedValueOnce({ encryptedDek: null })
        .mockResolvedValueOnce({ encryptedDek: 'winner-enc' });
      mockDecryptThreadKey.mockResolvedValue(Buffer.from('winner'));
      const create = jest.fn().mockResolvedValue({
        id: 'msg-1',
        role: 'USER',
        content: 'encrypted:hello',
        createdAt: new Date('2026-01-01'),
        messageType: 'TEXT',
        voiceDurationSeconds: null,
        voicePlayed: false,
        attachments: null,
      });
      const { service } = makeService({
        thread: { findUniqueOrThrow, updateMany },
        message: { create },
      });

      await service.createAndStoreMessage({
        prompt: 'hello',
        threadId: 'thread-1',
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'thread-1', encryptedDek: null },
        data: { encryptedDek: 'fresh-enc' },
      });
      expect(mockDecryptThreadKey).toHaveBeenCalledWith('winner-enc');
    });

    it('auto-sets the thread title from the trimmed prompt', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const create = jest.fn().mockResolvedValue({
        id: 'msg-1',
        role: 'USER',
        content: 'hello',
        createdAt: new Date('2026-01-01'),
        messageType: 'TEXT',
        voiceDurationSeconds: null,
        voicePlayed: false,
        attachments: null,
      });
      const { service } = makeService({
        thread: { updateMany },
        message: { create },
      });

      await service.createAndStoreMessage({
        prompt: 'hello world',
        threadId: 'thread-1',
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'thread-1', title: null },
        data: { title: 'hello world' },
      });
    });

    it('creates a visitor entry (fire-and-forget) when visitorId is provided', async () => {
      const visitorCreate = jest.fn().mockResolvedValue({});
      const create = jest.fn().mockResolvedValue({
        id: 'msg-1',
        role: 'USER',
        content: 'hi',
        createdAt: new Date('2026-01-01'),
        messageType: 'TEXT',
        voiceDurationSeconds: null,
        voicePlayed: false,
        attachments: null,
      });
      const { service } = makeService({
        message: { create },
        visitorMessages: { create: visitorCreate },
      });

      await service.createAndStoreMessage({
        prompt: 'hi',
        threadId: 'thread-1',
        visitorId: 'visitor-1',
      });
      await Promise.resolve();

      expect(visitorCreate).toHaveBeenCalledWith({
        data: { messageId: 'msg-1', visitorId: 'visitor-1' },
      });
    });
  });

  describe('deleteMessage', () => {
    it('deletes a message scoped to the org via the thread project', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'msg-1' });
      const del = jest.fn().mockResolvedValue({});
      const { service } = makeService({
        message: { findFirst, delete: del },
      });

      const result = await service.deleteMessage('msg-1', 'org-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: 'msg-1',
          thread: { project: { organizationId: 'org-1' } },
        },
        select: { id: true },
      });
      expect(del).toHaveBeenCalledWith({ where: { id: 'msg-1' } });
      expect(result).toEqual({ success: true });
    });

    it('returns a not-found error without deleting when the message is out of scope', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const del = jest.fn();
      const { service } = makeService({
        message: { findFirst, delete: del },
      });

      const result = await service.deleteMessage('msg-1', 'org-1');

      expect(result).toEqual({ success: false, error: 'Message not found' });
      expect(del).not.toHaveBeenCalled();
    });
  });

  describe('rateMessage', () => {
    it('rejects an invalid feedback value without querying the DB', async () => {
      const findFirst = jest.fn();
      const { service } = makeService({ message: { findFirst } });

      // @ts-expect-error deliberately invalid feedback value
      const result = await service.rateMessage('msg-1', 'sideways', 'org-1');

      expect(result).toEqual({ success: false, error: 'Invalid feedback' });
      expect(findFirst).not.toHaveBeenCalled();
    });

    it('scopes the update to the org via thread.organizationId', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'msg-1' });
      const update = jest.fn().mockResolvedValue({});
      const { service } = makeService({ message: { findFirst, update } });

      await service.rateMessage('msg-1', 'up', 'org-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'msg-1', thread: { organizationId: 'org-1' } },
        select: { id: true },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { rate: 1 },
      });
    });

    it('maps "down" feedback to rate 0', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'msg-1' });
      const update = jest.fn().mockResolvedValue({});
      const { service } = makeService({ message: { findFirst, update } });

      await service.rateMessage('msg-1', 'down', 'org-1');

      expect(update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { rate: 0 },
      });
    });
  });

  describe('updateMessagePlayed', () => {
    it('throws when orgId is falsy', async () => {
      const { service } = makeService();

      await expect(service.updateMessagePlayed('msg-1', '')).rejects.toThrow(
        'Unauthorized: organization context required',
      );
    });

    it('throws when the message is not found in scope', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const { service } = makeService({ message: { findFirst } });

      await expect(
        service.updateMessagePlayed('msg-1', 'org-1'),
      ).rejects.toThrow('Message not found');
    });

    it('marks the message as played/voice on success', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'msg-1' });
      const update = jest.fn().mockResolvedValue({ id: 'msg-1' });
      const { service } = makeService({ message: { findFirst, update } });

      await service.updateMessagePlayed('msg-1', 'org-1');

      expect(update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { voicePlayed: true, messageType: 'VOICE' },
      });
    });
  });

  describe('regenerateAssistantMessage', () => {
    const userMessage = {
      id: 'msg-user-1',
      role: 'USER',
      content: 'What are the benefits of RAG?',
      attachments: null,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    };
    const assistantMessage = {
      id: 'msg-asst-1',
      role: 'ASSISTANT',
      content: 'RAG lets you...',
      attachments: null,
      createdAt: new Date('2026-01-01T10:00:05Z'),
    };

    it('deletes the last assistant+user pair and returns the resubmit prompt', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'thread-1',
        messages: [userMessage, assistantMessage],
      });
      const { service, $transaction } = makeService({
        thread: { findFirst },
      });

      const result = await service.regenerateAssistantMessage(
        'thread-1',
        'org-1',
        'user-1',
      );

      expect(result).toEqual({
        success: true,
        data: { prompt: userMessage.content, attachments: [] },
      });
      expect($transaction).toHaveBeenCalledTimes(1);
    });

    it('scopes the thread lookup to the org — 404s for a cross-org thread', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const { service, $transaction } = makeService({
        thread: { findFirst },
      });

      const result = await service.regenerateAssistantMessage(
        'thread-1',
        'other-org',
        'user-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
      expect($transaction).not.toHaveBeenCalled();
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'thread-1', organizationId: 'other-org' },
        }),
      );
    });

    it('errors when there is no assistant message to regenerate', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'thread-1',
        messages: [userMessage],
      });
      const { service } = makeService({ thread: { findFirst } });

      const result = await service.regenerateAssistantMessage(
        'thread-1',
        'org-1',
        'user-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no assistant message/i);
    });

    it('errors when there is no user message before the last assistant message', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'thread-1',
        messages: [assistantMessage],
      });
      const { service } = makeService({ thread: { findFirst } });

      const result = await service.regenerateAssistantMessage(
        'thread-1',
        'org-1',
        'user-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no user message/i);
    });
  });

  describe('getThreadMessages', () => {
    it('returns an empty result when the thread is not found for the visitor', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const { service } = makeService({ thread: { findFirst } });

      const result = await service.getThreadMessages('thread-1', 'visitor-1');

      expect(result).toEqual({ messages: [], threadContext: null });
    });

    it('decrypts messages when the thread has an encrypted DEK', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'thread-1',
        encryptedDek: 'enc-dek',
        mentionedProjectId: null,
        project: { id: 'proj-1', title: 'Project' },
      });
      const rawMessages = [
        { id: 'm1', createdAt: new Date('2026-01-01'), content: 'cipher' },
      ];
      const findMany = jest.fn().mockResolvedValue(rawMessages);
      mockDecryptMessageContents.mockResolvedValue([
        { id: 'm1', createdAt: new Date('2026-01-01'), content: 'plain' },
      ]);
      const { service } = makeService({
        thread: { findFirst },
        message: { findMany },
      });

      const result = await service.getThreadMessages('thread-1', 'visitor-1');

      expect(mockDecryptMessageContents).toHaveBeenCalledWith(
        rawMessages,
        'enc-dek',
      );
      expect(result.messages[0].content).toBe('plain');
      expect(result.threadContext?.project).toEqual({
        id: 'proj-1',
        title: 'Project',
      });
    });

    it('falls back to raw messages when decryption throws', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'thread-1',
        encryptedDek: 'enc-dek',
        mentionedProjectId: null,
        project: null,
      });
      const rawMessages = [
        { id: 'm1', createdAt: new Date('2026-01-01'), content: 'cipher' },
      ];
      const findMany = jest.fn().mockResolvedValue(rawMessages);
      mockDecryptMessageContents.mockRejectedValue(new Error('bad key'));
      const { service } = makeService({
        thread: { findFirst },
        message: { findMany },
      });

      const result = await service.getThreadMessages('thread-1', 'visitor-1');

      expect(result.messages[0].content).toBe('cipher');
    });

    it('looks up the mentioned project when set', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'thread-1',
        encryptedDek: null,
        mentionedProjectId: 'proj-2',
        project: { id: 'proj-1', title: 'Project' },
      });
      const findMany = jest.fn().mockResolvedValue([]);
      mockDecryptMessageContents.mockResolvedValue([]);
      const findUnique = jest
        .fn()
        .mockResolvedValue({ id: 'proj-2', title: 'Mentioned' });
      const { service } = makeService({
        thread: { findFirst },
        message: { findMany },
        project: { findUnique },
      });

      const result = await service.getThreadMessages('thread-1', 'visitor-1');

      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'proj-2' },
        select: { id: true, title: true },
      });
      expect(result.threadContext?.mentionedProject).toEqual({
        id: 'proj-2',
        title: 'Mentioned',
      });
    });
  });

  describe('getNegativeQa', () => {
    it('returns empty items and total 0 when there are no negative messages', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const { service } = makeService({ message: { findMany, count } });

      const result = await service.getNegativeQa('org-1', 30);

      expect(result).toEqual({ items: [], total: 0 });
    });

    it('filters rate=0 messages scoped to the org', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const { service } = makeService({ message: { findMany } });

      await service.getNegativeQa('org-1', 30);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            rate: 0,
            thread: { organizationId: 'org-1' },
          }),
        }),
      );
    });

    it('paginates with skip/take of 10 per page', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const { service } = makeService({ message: { findMany } });

      await service.getNegativeQa('org-1', 30, 2);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('maps rows to NegativeQaItem', async () => {
      const createdAt = new Date('2026-01-01');
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'msg-1',
          createdAt,
          thread: { id: 'thread-1', title: 'My thread' },
        },
      ]);
      const count = jest.fn().mockResolvedValue(1);
      const { service } = makeService({ message: { findMany, count } });

      const result = await service.getNegativeQa('org-1', 30);

      expect(result.items[0]).toEqual({
        messageId: 'msg-1',
        threadId: 'thread-1',
        threadTitle: 'My thread',
        createdAt: createdAt.toISOString(),
      });
      expect(result.total).toBe(1);
    });
  });
});
