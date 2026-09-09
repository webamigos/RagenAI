import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role, EmbeddingStatus } from '../generated/prisma/client.js';
import { COUNTED_THREAD_SOURCES } from '../common/utils/analytics-scope.js';
import type {
  KnowledgeAnalyticsSummary,
  DailyQuestion,
  TopCitedDocument,
  UnusedDocument,
} from './types.js';

const UNUSED_THRESHOLD_DAYS = 90;

/**
 * Ported from apps/web's src/features/documents/services/queries/
 * {get-knowledge-analytics-summary-query,get-daily-questions-query,
 * get-top-cited-documents-query,get-unused-documents-query}.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * All four already took explicit `orgId`/`days` params in the original —
 * no session-derivation to adapt.
 */
@Injectable()
export class KnowledgeAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Total questions" is user messages in the window, by message date.
   *
   * The ported version summed *every* message of every thread *created* in
   * the window. That double-counted (each question has an answer) and was
   * off by thread age, so the card disagreed with the daily chart below it —
   * which has always counted USER messages by `createdAt` — by a factor of
   * roughly two. Both read from the same rows now.
   */
  async getSummary(
    orgId: string,
    days: number,
  ): Promise<KnowledgeAnalyticsSummary> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [questions, rated] = await Promise.all([
      this.prisma.client.message.findMany({
        where: {
          thread: { organizationId: orgId, ...COUNTED_THREAD_SOURCES },
          role: Role.USER,
          createdAt: { gte: since },
        },
        select: { thread: { select: { userId: true } } },
      }),
      this.prisma.client.message.findMany({
        where: {
          thread: { organizationId: orgId, ...COUNTED_THREAD_SOURCES },
          rate: { not: null },
          createdAt: { gte: since },
        },
        select: { rate: true },
      }),
    ]);

    const totalQuestions = questions.length;

    const uniqueUsers = new Set(
      questions
        .map((m) => m.thread?.userId ?? null)
        .filter((id): id is string => id !== null),
    ).size;

    const positiveCount = rated.filter((m) => m.rate === 1).length;
    const positiveRatePct =
      rated.length > 0
        ? Math.round((positiveCount / rated.length) * 10000) / 100
        : 0;

    return { totalQuestions, uniqueUsers, positiveRatePct };
  }

  async getDailyQuestions(
    orgId: string,
    days: number,
  ): Promise<DailyQuestion[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const messages = await this.prisma.client.message.findMany({
      where: {
        thread: { organizationId: orgId, ...COUNTED_THREAD_SOURCES },
        createdAt: { gte: since },
        role: Role.USER,
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const countsByDate = new Map<string, number>();

    for (let i = 0; i <= days; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      countsByDate.set(d.toISOString().slice(0, 10), 0);
    }

    for (const msg of messages) {
      const key = msg.createdAt.toISOString().slice(0, 10);
      if (countsByDate.has(key)) {
        countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
      }
    }

    return Array.from(countsByDate.entries()).map(([date, count]) => ({
      date,
      count,
    }));
  }

  async getTopCitedDocuments(orgId: string): Promise<TopCitedDocument[]> {
    const groups = await this.prisma.client.documentCitation.groupBy({
      by: ['fileId'],
      where: { orgId },
      _count: { fileId: true },
      orderBy: { _count: { fileId: 'desc' } },
      take: 10,
    });

    if (groups.length === 0) {
      return [];
    }

    const fileIds = groups.map((g) => g.fileId);

    const files = await this.prisma.client.userFile.findMany({
      where: { id: { in: fileIds }, organizationId: orgId },
      select: { id: true, fileName: true },
    });

    const fileMap = new Map(files.map((f) => [f.id, f]));

    return groups
      .map((g) => {
        const file = fileMap.get(g.fileId);
        if (!file) {
          return null;
        }
        return {
          fileId: file.id,
          publicId: file.id,
          fileName: file.fileName,
          citationCount: g._count.fileId,
        };
      })
      .filter((item): item is TopCitedDocument => item !== null);
  }

  async getUnusedDocuments(orgId: string): Promise<UnusedDocument[]> {
    const threshold = new Date(
      Date.now() - UNUSED_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
    );

    const files = await this.prisma.client.userFile.findMany({
      where: {
        organizationId: orgId,
        embeddingStatus: EmbeddingStatus.COMPLETED,
        OR: [
          {
            documentCitations: { none: {} },
            createdAt: { lt: threshold },
          },
          {
            documentCitations: { some: {} },
            NOT: {
              documentCitations: { some: { createdAt: { gte: threshold } } },
            },
          },
        ],
      },
      select: {
        id: true,
        fileName: true,
        createdAt: true,
        documentCitations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const now = Date.now();

    return files.map((file) => {
      const lastCitation = file.documentCitations[0]?.createdAt ?? null;
      const referenceDate = lastCitation ?? file.createdAt ?? new Date(0);
      const daysSinceUsed = Math.floor(
        (now - referenceDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      return {
        fileId: file.id,
        publicId: file.id,
        fileName: file.fileName,
        lastCitedAt: lastCitation ? lastCitation.toISOString() : null,
        daysSinceUsed,
      };
    });
  }
}
