export type KnowledgeAnalyticsSummary = {
  totalQuestions: number;
  uniqueUsers: number;
  positiveRatePct: number;
};

export type TopCitedDocument = {
  fileId: string;
  publicId: string;
  fileName: string;
  citationCount: number;
};

export type UnusedDocument = {
  fileId: string;
  publicId: string;
  fileName: string;
  lastCitedAt: Date | null;
  daysSinceUsed: number;
};

export type NegativeQaItem = {
  threadId: string;
  messageId: string;
  threadTitle: string | null;
  createdAt: Date;
};

export type KnowledgeAnalyticsDashboardData = {
  summary: KnowledgeAnalyticsSummary;
  topCited: TopCitedDocument[];
  unusedDocs: UnusedDocument[];
  negativeQa: NegativeQaItem[];
};
