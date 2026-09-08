import { KnowledgeAnalyticsService } from './knowledge-analytics.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('KnowledgeAnalyticsService', () => {
  function makeService(overrides: {
    thread?: Partial<Record<string, jest.Mock>>;
    message?: Partial<Record<string, jest.Mock>>;
    documentCitation?: Partial<Record<string, jest.Mock>>;
    userFile?: Partial<Record<string, jest.Mock>>;
  }) {
    const prisma = {
      client: {
        thread: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.thread,
        },
        message: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.message,
        },
        documentCitation: {
          groupBy: jest.fn().mockResolvedValue([]),
          ...overrides.documentCitation,
        },
        userFile: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.userFile,
        },
      },
    } as unknown as PrismaService;

    return { service: new KnowledgeAnalyticsService(prisma), prisma };
  }

  describe('getSummary', () => {
    it('returns zeros when there are no messages', async () => {
      const { service } = makeService({});
      const result = await service.getSummary('org-1', 30);
      expect(result).toEqual({
        totalQuestions: 0,
        uniqueUsers: 0,
        positiveRatePct: 0,
      });
    });

    it('counts user messages in the window, the same rows the daily chart counts', async () => {
      // Two findMany calls, in the order the service issues them: questions
      // (USER role, with the thread's author) then rated messages.
      const findMany = jest
        .fn()
        .mockResolvedValueOnce([
          { thread: { userId: 'user-1' } },
          { thread: { userId: 'user-1' } },
          { thread: { userId: 'user-2' } },
          { thread: { userId: null } },
        ])
        .mockResolvedValueOnce([{ rate: 1 }, { rate: 0 }, { rate: 1 }]);
      const { service, prisma } = makeService({ message: { findMany } });

      const result = await service.getSummary('org-1', 30);

      // Four questions, not eight: assistant replies are not questions.
      expect(result.totalQuestions).toBe(4);
      expect(result.uniqueUsers).toBe(2);
      // 2 positive out of 3 rated = 66.67%
      expect(result.positiveRatePct).toBeCloseTo(66.67, 1);

      const [questionsWhere, ratedWhere] = (
        prisma.client.message.findMany as jest.Mock
      ).mock.calls.map((call) => call[0].where);
      expect(questionsWhere).toMatchObject({
        thread: { organizationId: 'org-1' },
        role: 'USER',
      });
      expect(questionsWhere.createdAt.gte).toBeInstanceOf(Date);
      expect(ratedWhere).toMatchObject({
        thread: { organizationId: 'org-1' },
        rate: { not: null },
      });
      // Thread creation date must not be the window: an old thread with a
      // question asked today counts today.
      expect(prisma.client.thread.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getDailyQuestions', () => {
    it('zero-fills every day in the range', async () => {
      const { service } = makeService({
        message: { findMany: jest.fn().mockResolvedValue([]) },
      });
      const result = await service.getDailyQuestions('org-1', 3);
      expect(result).toHaveLength(4);
      expect(result.every((d) => d.count === 0)).toBe(true);
    });

    it('buckets USER messages by day', async () => {
      const today = new Date();
      const { service } = makeService({
        message: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ createdAt: today }, { createdAt: today }]),
        },
      });

      const result = await service.getDailyQuestions('org-1', 0);

      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(2);
    });
  });

  describe('getTopCitedDocuments', () => {
    it('returns an empty array when there are no citations', async () => {
      const { service } = makeService({});
      const result = await service.getTopCitedDocuments('org-1');
      expect(result).toEqual([]);
    });

    it('joins citation groups with file metadata', async () => {
      const { service } = makeService({
        documentCitation: {
          groupBy: jest.fn().mockResolvedValue([
            { fileId: 'file-1', _count: { fileId: 5 } },
            { fileId: 'file-missing', _count: { fileId: 2 } },
          ]),
        },
        userFile: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'file-1', fileName: 'doc.pdf' }]),
        },
      });

      const result = await service.getTopCitedDocuments('org-1');

      expect(result).toEqual([
        {
          fileId: 'file-1',
          publicId: 'file-1',
          fileName: 'doc.pdf',
          citationCount: 5,
        },
      ]);
    });
  });

  describe('getUnusedDocuments', () => {
    it('computes daysSinceUsed from the last citation', async () => {
      const now = Date.now();
      const lastCited = new Date(now - 100 * 24 * 60 * 60 * 1000);
      const { service } = makeService({
        userFile: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'file-1',
              fileName: 'doc.pdf',
              createdAt: new Date(now - 200 * 24 * 60 * 60 * 1000),
              documentCitations: [{ createdAt: lastCited }],
            },
          ]),
        },
      });

      const result = await service.getUnusedDocuments('org-1');

      expect(result[0].lastCitedAt).toBe(lastCited.toISOString());
      expect(result[0].daysSinceUsed).toBe(100);
    });

    it('falls back to createdAt when there is no citation', async () => {
      const now = Date.now();
      const createdAt = new Date(now - 95 * 24 * 60 * 60 * 1000);
      const { service } = makeService({
        userFile: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'file-1',
              fileName: 'doc.pdf',
              createdAt,
              documentCitations: [],
            },
          ]),
        },
      });

      const result = await service.getUnusedDocuments('org-1');

      expect(result[0].lastCitedAt).toBeNull();
      expect(result[0].daysSinceUsed).toBe(95);
    });
  });
});
