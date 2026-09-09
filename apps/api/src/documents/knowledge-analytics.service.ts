import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role, EmbeddingStatus } from '../generated/prisma/client.js';
import { COUNTED_THREAD_SOURCES } from '../common/utils/analytics-scope.js';
import type {
  KnowledgeAnalyticsSummary,
  DailyQuestion,
  TopCitedDocument,
  UnusedDocument,
  StaleCitedDocument,
} from './types.js';

const UNUSED_THRESHOLD_DAYS = 90;

/**
 * How many of the window's cited files the stale panel considers, ranked by
 * citation count. Ten are shown; the cap keeps the follow-up `IN` list from
 * growing with the corpus.
 */
const STALE_CANDIDATE_LIMIT = 200;

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
    // Null, not 0. An organization where nobody has rated anything was
    // rendering a red "0.0%" — indistinguishable from one where every answer
    // was marked wrong, and the more alarming of the two readings.
    const positiveRatePct =
      rated.length > 0
        ? Math.round((positiveCount / rated.length) * 10000) / 100
        : null;

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

  /**
   * Top cited documents **within the window**, with the ratings the answers
   * citing them received.
   *
   * The window is the fix: this panel had none while every other section on
   * the screen used 30 days, so a document heavily cited in March outranked
   * one cited all week, on a page whose other panels disagreed with it.
   *
   * Ratings come from two aggregate queries rather than fetching the
   * citations and tallying in memory — a 90-day window over ten documents is
   * thousands of rows, and the database can count them.
   */
  async getTopCitedDocuments(
    orgId: string,
    days: number,
  ): Promise<TopCitedDocument[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const groups = await this.prisma.client.documentCitation.groupBy({
      by: ['fileId'],
      where: { orgId, createdAt: { gte: since } },
      _count: { fileId: true },
      orderBy: { _count: { fileId: 'desc' } },
      take: 10,
    });

    if (groups.length === 0) {
      return [];
    }

    const fileIds = groups.map((g) => g.fileId);

    const ratedWhere = (rate: number) => ({
      orgId,
      createdAt: { gte: since },
      fileId: { in: fileIds },
      message: { rate },
    });

    const [files, positives, negatives] = await Promise.all([
      this.prisma.client.userFile.findMany({
        where: { id: { in: fileIds }, organizationId: orgId },
        select: { id: true, fileName: true },
      }),
      this.prisma.client.documentCitation.groupBy({
        by: ['fileId'],
        where: ratedWhere(1),
        _count: { fileId: true },
      }),
      this.prisma.client.documentCitation.groupBy({
        by: ['fileId'],
        where: ratedWhere(0),
        _count: { fileId: true },
      }),
    ]);

    const fileMap = new Map(files.map((f) => [f.id, f]));
    const positiveMap = new Map(
      positives.map((p) => [p.fileId, p._count.fileId]),
    );
    const negativeMap = new Map(
      negatives.map((n) => [n.fileId, n._count.fileId]),
    );

    return groups
      .map((g) => {
        const file = fileMap.get(g.fileId);
        if (!file) {
          return null;
        }
        const positiveCount = positiveMap.get(g.fileId) ?? 0;
        const negativeCount = negativeMap.get(g.fileId) ?? 0;
        const rated = positiveCount + negativeCount;

        return {
          fileId: file.id,
          publicId: file.id,
          fileName: file.fileName,
          citationCount: g._count.fileId,
          positiveCount,
          negativeCount,
          // Null, not zero. "Nobody rated this" and "everybody disliked this"
          // are opposite findings and 0% would render them the same.
          positiveRatePct:
            rated > 0
              ? Math.round((positiveCount / rated) * 10000) / 100
              : null,
        };
      })
      .filter((item): item is TopCitedDocument => item !== null);
  }

  /**
   * Documents answers keep citing that nobody has revised in a long time.
   *
   * The mirror image of `getUnusedDocuments`, and the more expensive of the
   * two: an unused document costs storage, whereas a stale one that retrieval
   * still reaches lends its age to every answer drawn from it.
   *
   * No staleness threshold, deliberately. The screen already carries one
   * fixed threshold (90 days, in "unused") and inventing a second would mean
   * choosing an age at which a document becomes wrong, which depends entirely
   * on what the document is. The ordering carries the signal instead: a
   * corpus that is actively maintained simply shows small numbers here.
   */
  async getStaleCitedDocuments(
    orgId: string,
    days: number,
  ): Promise<StaleCitedDocument[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const groups = await this.prisma.client.documentCitation.groupBy({
      by: ['fileId'],
      where: { orgId, createdAt: { gte: since } },
      _count: { fileId: true },
      _max: { createdAt: true },
      // Bounded, because the unbounded version fed every cited file in the
      // window into an `IN` list on the next query. Candidates are the
      // most-cited of the window, which is the right cut for this panel: a
      // document cited twice in ninety days is not one answers "keep citing".
      orderBy: { _count: { fileId: 'desc' } },
      take: STALE_CANDIDATE_LIMIT,
    });

    if (groups.length === 0) {
      return [];
    }

    const files = await this.prisma.client.userFile.findMany({
      where: { id: { in: groups.map((g) => g.fileId) }, organizationId: orgId },
      select: { id: true, fileName: true, updatedAt: true, createdAt: true },
    });

    const fileMap = new Map(files.map((f) => [f.id, f]));
    const now = Date.now();

    return groups
      .map((group) => {
        const file = fileMap.get(group.fileId);
        const lastCitedAt = group._max.createdAt;
        if (!file || !lastCitedAt) {
          return null;
        }

        // `updatedAt` is nullable and unset on files never revised since
        // upload, where the upload date is the honest answer rather than a
        // gap in the table.
        const lastUpdatedAt = file.updatedAt ?? file.createdAt;
        if (!lastUpdatedAt) {
          return null;
        }

        // Revised since it was last cited, so not stale — someone has been
        // here more recently than the answers have. Dropping it here rather
        // than relying on the sort: on a corpus where everything is old, a
        // freshly revised document would otherwise still surface.
        if (lastUpdatedAt.getTime() > lastCitedAt.getTime()) {
          return null;
        }

        return {
          fileId: file.id,
          publicId: file.id,
          fileName: file.fileName,
          citationCount: group._count.fileId,
          lastCitedAt: lastCitedAt.toISOString(),
          lastUpdatedAt: lastUpdatedAt.toISOString(),
          daysSinceUpdated: Math.floor(
            (now - lastUpdatedAt.getTime()) / (1000 * 60 * 60 * 24),
          ),
        };
      })
      .filter((item): item is StaleCitedDocument => item !== null)
      .sort((a, b) => b.daysSinceUpdated - a.daysSinceUpdated)
      .slice(0, 10);
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
