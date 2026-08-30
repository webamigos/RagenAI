import { KnowledgeAnalyticsService } from './knowledge-analytics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
    it('returns zeros when there are no threads', async () => {
      const { service } = makeService({});
      const result = await service.getSummary('org-1', 30);
      expect(result).toEqual({
        totalQuestions: 0,
        uniqueUsers: 0,
        positiveRatePct: 0,
      });
    });

    it('computes totals, unique users, and positive rate', async () => {
      const { service } = makeService({
        thread: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 't1',
              userId: 'user-1',
              messages: [
                { id: 'm1', rate: 1 },
                { id: 'm2', rate: -1 },
              ],
            },
            {
              id: 't2',
              userId: 'user-2',
              messages: [{ id: 'm3', rate: 1 }],
            },
            {
              id: 't3',
              userId: null,
              messages: [{ id: 'm4', rate: null }],
            },
          ]),
        },
      });

      const result = await service.getSummary('org-1', 30);

      expect(result.totalQuestions).toBe(4);
      expect(result.uniqueUsers).toBe(2);
      // 2 positive out of 3 rated messages = 66.67%
      expect(result.positiveRatePct).toBeCloseTo(66.67, 1);
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
