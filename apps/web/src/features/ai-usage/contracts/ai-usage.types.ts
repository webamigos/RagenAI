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

export type AiUsageByOrgDataPoint = {
  organizationName: string;
  calls: number;
  tokens: number;
  cost: number;
};

export type AiUsageChartData = {
  daily: AiUsageDailyDataPoint[];
  byStep: AiUsageByStepDataPoint[];
  byModel: AiUsageByModelDataPoint[];
  byOrg: AiUsageByOrgDataPoint[];
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
