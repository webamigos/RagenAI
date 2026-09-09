export type KnowledgeAnalyticsSummary = {
  totalQuestions: number;
  uniqueUsers: number;
  /** Null when nothing was rated — not 0, which reads as "all bad". */
  positiveRatePct: number | null;
};

/** Mirrors `apps/api`'s type of the same name (ADR-21). */
export type TopCitedDocument = {
  fileId: string;
  publicId: string;
  fileName: string;
  citationCount: number;
  positiveCount: number;
  negativeCount: number;
  /** Null when nothing was rated — not 0, which reads as "everyone disliked it". */
  positiveRatePct: number | null;
};

/**
 * A document answers keep citing that nobody has revised in a long time.
 *
 * The opposite reading of `UnusedDocument`: not material going stale unread,
 * but material going stale while being relied on.
 */
export type StaleCitedDocument = {
  fileId: string;
  publicId: string;
  fileName: string;
  citationCount: number;
  lastCitedAt: string;
  lastUpdatedAt: string;
  daysSinceUpdated: number;
};

/** The windows the period selector offers. */
export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];
export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriod = 30;

export type UnusedDocument = {
  fileId: string;
  publicId: string;
  fileName: string;
  lastCitedAt: string | null;
  daysSinceUsed: number;
};

export type DailyQuestion = {
  date: string;
  count: number;
};

export type NegativeQaItem = {
  threadId: string;
  messageId: string;
  threadTitle: string | null;
  createdAt: string;
};

export type NegativeQaResult = {
  items: NegativeQaItem[];
  total: number;
};

export type KnowledgeAnalyticsDashboardData = {
  summary: KnowledgeAnalyticsSummary;
  dailyQuestions: DailyQuestion[];
  topCited: TopCitedDocument[];
  staleCited: StaleCitedDocument[];
  unusedDocs: UnusedDocument[];
  negativeQa: NegativeQaResult;
};
