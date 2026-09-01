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
  unusedDocs: UnusedDocument[];
  negativeQa: NegativeQaResult;
};
