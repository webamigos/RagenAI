import {
  getLiteLLMSpendLogs,
  getLiteLLMTeamInfo,
  inferOrigin,
} from '@/libs/litellm/client';
import type { LiteLLMSpendLog } from '@/libs/litellm/types';
import type {
  AiUsageDashboardData,
  AiUsageListItem,
  AiUsageSummary,
  AiUsageChartData,
  AiUsageDailyDataPoint,
  AiUsageByStepDataPoint,
  AiUsageByModelDataPoint,
  AiUsageByOrgDataPoint,
  AiUsageFilters,
} from '../../contracts/ai-usage.types';
import type { AiUsageStep } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

function mapCallTypeToStep(callType: string): AiUsageStep {
  switch (callType) {
    case 'embedding':
    case 'aembedding':
      return 'EMBEDDINGS' as AiUsageStep;
    case 'completion':
    case 'acompletion':
      return 'CHAT_COMPLETION' as AiUsageStep;
    default:
      return 'CHAT_COMPLETION' as AiUsageStep;
  }
}

function inferProvider(model: string): string {
  return inferOrigin(model);
}

function getDateRange(filters?: AiUsageFilters): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const endDate = filters?.dateTo || now.toISOString().split('T')[0];

  let startDate: string;
  if (filters?.dateFrom) {
    startDate = filters.dateFrom;
  } else {
    const period = filters?.period || '30d';
    const daysMap: Record<string, number> = {
      '1d': 1,
      '7d': 7,
      '14d': 14,
      '30d': 30,
      '365d': 365,
    };
    const days = daysMap[period] || 30;
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    startDate = start.toISOString().split('T')[0];
  }

  return { startDate, endDate };
}

function mapSpendLogToItem(
  log: LiteLLMSpendLog,
  orgName: string,
  orgId: string,
): AiUsageListItem {
  return {
    id: log.request_id,
    step: mapCallTypeToStep(log.call_type),
    provider: inferProvider(log.model),
    model: log.model,
    inputTokens: log.prompt_tokens,
    outputTokens: log.completion_tokens,
    totalTokens: log.total_tokens,
    estimatedCost: log.spend,
    durationMs:
      log.startTime && log.endTime
        ? new Date(log.endTime).getTime() - new Date(log.startTime).getTime()
        : null,
    createdAt: new Date(log.startTime),
    organizationName: orgName,
    organizationId: orgId,
    project: null,
    user: null,
  };
}

function buildChartData(
  logs: LiteLLMSpendLog[],
  orgName: string,
): AiUsageChartData {
  // Daily aggregation
  const dailyMap = new Map<
    string,
    { calls: number; tokens: number; cost: number }
  >();
  const stepMap = new Map<
    string,
    { calls: number; tokens: number; cost: number }
  >();
  const modelMap = new Map<
    string,
    { calls: number; tokens: number; cost: number }
  >();

  for (const log of logs) {
    // Daily
    const date = new Date(log.startTime).toISOString().split('T')[0];
    const daily = dailyMap.get(date) || { calls: 0, tokens: 0, cost: 0 };
    daily.calls++;
    daily.tokens += log.total_tokens;
    daily.cost += log.spend;
    dailyMap.set(date, daily);

    // By step
    const step = mapCallTypeToStep(log.call_type);
    const stepData = stepMap.get(step) || { calls: 0, tokens: 0, cost: 0 };
    stepData.calls++;
    stepData.tokens += log.total_tokens;
    stepData.cost += log.spend;
    stepMap.set(step, stepData);

    // By model
    const modelData = modelMap.get(log.model) || {
      calls: 0,
      tokens: 0,
      cost: 0,
    };
    modelData.calls++;
    modelData.tokens += log.total_tokens;
    modelData.cost += log.spend;
    modelMap.set(log.model, modelData);
  }

  const daily: AiUsageDailyDataPoint[] = Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byStep: AiUsageByStepDataPoint[] = Array.from(stepMap.entries()).map(
    ([step, data]) => ({ step, ...data }),
  );

  const byModel: AiUsageByModelDataPoint[] = Array.from(modelMap.entries()).map(
    ([model, data]) => ({ model, ...data }),
  );

  const byOrg: AiUsageByOrgDataPoint[] =
    logs.length > 0
      ? [
          {
            organizationName: orgName,
            calls: logs.length,
            tokens: logs.reduce((sum, l) => sum + l.total_tokens, 0),
            cost: logs.reduce((sum, l) => sum + l.spend, 0),
          },
        ]
      : [];

  return { daily, byStep, byModel, byOrg };
}

/**
 * Fetch AI usage dashboard data from LiteLLM spend logs.
 * Replaces the old AiUsage table-based query.
 */
export async function getLiteLLMUsageDashboardQuery(
  filters?: AiUsageFilters,
): Promise<AiUsageDashboardData> {
  const { startDate, endDate } = getDateRange(filters);
  const orgId = filters?.organizationId;

  if (!orgId) {
    // Global view for app admins — fetch all orgs
    return getLiteLLMGlobalUsageQuery(filters);
  }

  try {
    const [logs, orgRecord] = await Promise.all([
      getLiteLLMSpendLogs({ teamId: orgId, startDate, endDate }),
      db.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      }),
    ]);

    const orgName = orgRecord?.name || orgId;

    // Apply additional filters
    let filteredLogs = logs;
    if (filters?.step) {
      filteredLogs = filteredLogs.filter(
        (l) => mapCallTypeToStep(l.call_type) === filters.step,
      );
    }

    // Sort by time descending to get most recent items
    filteredLogs.sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );

    const items = filteredLogs
      .slice(0, 500)
      .map((l) => mapSpendLogToItem(l, orgName, orgId));

    const summary: AiUsageSummary = {
      totalCalls: filteredLogs.length,
      totalTokens: filteredLogs.reduce((sum, l) => sum + l.total_tokens, 0),
      totalInputTokens: filteredLogs.reduce(
        (sum, l) => sum + l.prompt_tokens,
        0,
      ),
      totalOutputTokens: filteredLogs.reduce(
        (sum, l) => sum + l.completion_tokens,
        0,
      ),
      totalCost: filteredLogs.reduce((sum, l) => sum + l.spend, 0),
    };

    const charts = buildChartData(filteredLogs, orgName);

    return { summary, items, charts };
  } catch (error) {
    logger.error(
      { err: error, orgId },
      'Failed to fetch LiteLLM usage data, returning empty dashboard',
    );
    return {
      summary: {
        totalCalls: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
      },
      items: [],
      charts: { daily: [], byStep: [], byModel: [], byOrg: [] },
    };
  }
}

/**
 * Fetch global usage across all organizations (for app admin view).
 */
async function getLiteLLMGlobalUsageQuery(
  filters?: AiUsageFilters,
): Promise<AiUsageDashboardData> {
  const { startDate, endDate } = getDateRange(filters);

  try {
    // Fetch all orgs and their spend logs in parallel
    const organizations = await db.organization.findMany({
      select: { id: true, name: true },
    });

    const allLogs: Array<LiteLLMSpendLog & { orgName: string; orgId: string }> =
      [];

    // Fetch spend logs for each org (batch of 10 at a time)
    const batchSize = 10;
    for (let i = 0; i < organizations.length; i += batchSize) {
      const batch = organizations.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (org) => {
          const logs = await getLiteLLMSpendLogs({
            teamId: org.id,
            startDate,
            endDate,
          });
          return logs.map((l) => ({ ...l, orgName: org.name, orgId: org.id }));
        }),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          allLogs.push(...result.value);
        } else {
          logger.warn(
            { reason: result.reason, orgId: batch[j].id },
            'Failed to fetch spend logs for organization',
          );
        }
      }
    }

    // Apply filters
    let filteredLogs = allLogs;
    if (filters?.step) {
      filteredLogs = filteredLogs.filter(
        (l) => mapCallTypeToStep(l.call_type) === filters.step,
      );
    }

    // Sort by time descending
    filteredLogs.sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );

    const items: AiUsageListItem[] = filteredLogs
      .slice(0, 500)
      .map((l) => mapSpendLogToItem(l, l.orgName, l.orgId));

    const summary: AiUsageSummary = {
      totalCalls: filteredLogs.length,
      totalTokens: filteredLogs.reduce((sum, l) => sum + l.total_tokens, 0),
      totalInputTokens: filteredLogs.reduce(
        (sum, l) => sum + l.prompt_tokens,
        0,
      ),
      totalOutputTokens: filteredLogs.reduce(
        (sum, l) => sum + l.completion_tokens,
        0,
      ),
      totalCost: filteredLogs.reduce((sum, l) => sum + l.spend, 0),
    };

    // Build chart data with per-org breakdown
    const dailyMap = new Map<
      string,
      { calls: number; tokens: number; cost: number }
    >();
    const stepMap = new Map<
      string,
      { calls: number; tokens: number; cost: number }
    >();
    const modelMap = new Map<
      string,
      { calls: number; tokens: number; cost: number }
    >();
    const orgMap = new Map<
      string,
      { calls: number; tokens: number; cost: number }
    >();

    for (const log of filteredLogs) {
      const date = new Date(log.startTime).toISOString().split('T')[0];
      const daily = dailyMap.get(date) || { calls: 0, tokens: 0, cost: 0 };
      daily.calls++;
      daily.tokens += log.total_tokens;
      daily.cost += log.spend;
      dailyMap.set(date, daily);

      const step = mapCallTypeToStep(log.call_type);
      const stepData = stepMap.get(step) || { calls: 0, tokens: 0, cost: 0 };
      stepData.calls++;
      stepData.tokens += log.total_tokens;
      stepData.cost += log.spend;
      stepMap.set(step, stepData);

      const modelData = modelMap.get(log.model) || {
        calls: 0,
        tokens: 0,
        cost: 0,
      };
      modelData.calls++;
      modelData.tokens += log.total_tokens;
      modelData.cost += log.spend;
      modelMap.set(log.model, modelData);

      const orgData = orgMap.get(log.orgName) || {
        calls: 0,
        tokens: 0,
        cost: 0,
      };
      orgData.calls++;
      orgData.tokens += log.total_tokens;
      orgData.cost += log.spend;
      orgMap.set(log.orgName, orgData);
    }

    const charts: AiUsageChartData = {
      daily: Array.from(dailyMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byStep: Array.from(stepMap.entries()).map(([step, data]) => ({
        step,
        ...data,
      })),
      byModel: Array.from(modelMap.entries()).map(([model, data]) => ({
        model,
        ...data,
      })),
      byOrg: Array.from(orgMap.entries()).map(([organizationName, data]) => ({
        organizationName,
        ...data,
      })),
    };

    return { summary, items, charts };
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch global LiteLLM usage data');
    return {
      summary: {
        totalCalls: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
      },
      items: [],
      charts: { daily: [], byStep: [], byModel: [], byOrg: [] },
    };
  }
}

/**
 * Get organization usage limits status from LiteLLM team info + org settings.
 */
export async function getLiteLLMOrgUsageLimitsQuery(orgId: string) {
  try {
    const [teamInfo, orgSettings] = await Promise.all([
      getLiteLLMTeamInfo(orgId),
      db.organizationSettings.findUnique({
        where: { organizationId: orgId },
        select: {
          monthlyTokenLimit: true,
          monthlyCostLimitCents: true,
          monthlyMessageLimit: true,
          maxMembers: true,
        },
      }),
    ]);

    const currentSpend = teamInfo?.spend ?? 0;
    const maxBudget = teamInfo?.max_budget ?? null;

    const costLimitCents = orgSettings?.monthlyCostLimitCents ?? null;
    const currentCostCents = Math.round(currentSpend * 100);

    return {
      limits: {
        monthlyTokenLimit: orgSettings?.monthlyTokenLimit
          ? Number(orgSettings.monthlyTokenLimit)
          : (null as number | null),
        monthlyCostLimitCents: costLimitCents,
        monthlyMessageLimit: orgSettings?.monthlyMessageLimit ?? null,
        maxMembers: orgSettings?.maxMembers ?? null,
      },
      current: {
        totalTokens: 0,
        totalCostCents: currentCostCents,
        totalMessages: 0,
      },
      exceeded: {
        tokens: false,
        cost: costLimitCents !== null && currentCostCents >= costLimitCents,
        messages: false,
      },
      litellm: {
        spend: currentSpend,
        maxBudget,
      },
    };
  } catch (error) {
    logger.error(
      { err: error, orgId },
      'Failed to fetch LiteLLM org usage limits',
    );
    return {
      limits: {
        monthlyTokenLimit: null as number | null,
        monthlyCostLimitCents: null as number | null,
        monthlyMessageLimit: null as number | null,
        maxMembers: null as number | null,
      },
      current: { totalTokens: 0, totalCostCents: 0, totalMessages: 0 },
      exceeded: { tokens: false, cost: false, messages: false },
      litellm: { spend: 0, maxBudget: null as number | null },
    };
  }
}
