import type { AiUsageStep } from '@/generated/prisma/client';

export type AiUsageListItem = {
  id: string;
  step: AiUsageStep;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  durationMs: number | null;
  createdAt: Date;
  organizationName: string;
  organizationId: string;
  project: { id: string; title: string } | null;
  user: { id: string; name: string | null; email: string } | null;
};

export type AiUsageFilters = {
  period?: '1d' | '7d' | '14d' | '30d' | '365d' | 'custom';
  dateFrom?: string;
  dateTo?: string;
  organizationId?: string;
  projectId?: string;
  userId?: string;
  step?: AiUsageStep;
};

export type AiUsageSummary = {
  totalCalls: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
};

export type AiUsageDailyDataPoint = {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
};

export type AiUsageByStepDataPoint = {
  step: string;
  calls: number;
  tokens: number;
  cost: number;
};

export type AiUsageByModelDataPoint = {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
};

export type AiUsageChartData = {
  daily: AiUsageDailyDataPoint[];
  byStep: AiUsageByStepDataPoint[];
  byModel: AiUsageByModelDataPoint[];
};

export type AiUsageDashboardData = {
  summary: AiUsageSummary;
  items: AiUsageListItem[];
  charts: AiUsageChartData;
};

export type CreateAiUsageInput = {
  organizationId: string;
  projectId?: string | null;
  threadId?: string | null;
  userId?: string | null;
  /**
   * The team the request is billed to; `null` for organization-level work.
   *
   * Required rather than optional, deliberately. The first version was
   * optional and the two `/v1` chat routes silently omitted it while holding a
   * resolved team in hand — their spend landed in the organization total and
   * was missing from the team's, which is the number an administrator checks a
   * budget against. Required means every producer states which it is.
   */
  teamId: string | null;
  step: AiUsageStep;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost?: number;
  durationMs?: number | null;
  metadata?: Record<string, string | number | boolean | null> | null;
};
