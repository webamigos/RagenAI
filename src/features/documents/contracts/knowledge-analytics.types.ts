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
  lastCitedAt: string | null;
  daysSinceUsed: number;
};

export type NegativeQaItem = {
  threadId: string;
  messageId: string;
  threadTitle: string | null;
  createdAt: string;
};

export type KnowledgeAnalyticsDashboardData = {
  summary: KnowledgeAnalyticsSummary;
  topCited: TopCitedDocument[];
  unusedDocs: UnusedDocument[];
  negativeQa: NegativeQaItem[];
};
