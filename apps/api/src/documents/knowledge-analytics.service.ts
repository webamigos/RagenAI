import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role, EmbeddingStatus } from '../generated/prisma/client.js';
import type {
  KnowledgeAnalyticsSummary,
  DailyQuestion,
  TopCitedDocument,
  UnusedDocument,
} from './types.js';

const UNUSED_THRESHOLD_DAYS = 90;

/**
 * Ported from ragen-app's src/features/documents/services/queries/
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

  async getSummary(
    orgId: string,
    days: number,
  ): Promise<KnowledgeAnalyticsSummary> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const threads = await this.prisma.client.thread.findMany({
      where: { organizationId: orgId, createdAt: { gte: since } },
      select: {
        id: true,
        userId: true,
        messages: { select: { id: true, rate: true } },
      },
    });

    const totalQuestions = threads.reduce(
      (sum, t) => sum + t.messages.length,
      0,
    );

    const uniqueUsers = new Set(
      threads.map((t) => t.userId).filter((id): id is string => id !== null),
    ).size;

    const ratedMessages = threads
      .flatMap((t) => t.messages)
      .filter((m) => m.rate !== null);

    const positiveCount = ratedMessages.filter((m) => m.rate === 1).length;
    const positiveRatePct =
      ratedMessages.length > 0
        ? Math.round((positiveCount / ratedMessages.length) * 10000) / 100
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
        thread: { organizationId: orgId },
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
