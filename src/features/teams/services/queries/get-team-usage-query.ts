'use server';

import { logger } from '@/app/lib/utils/logger';
import { getLiteLLMSpendLogs } from '@/libs/litellm/client';
import type { LiteLLMSpendLog } from '@/libs/litellm/types';
import db from '@ragenai/prisma-client';
import type { TeamUsage } from '../../contracts/team.types';

const WINDOW_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

function windowStart(budgetDuration: string): Date {
  const days = WINDOW_DAYS[budgetDuration] ?? 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Aggregate LiteLLM spend for one team across the current budget window.
 *
 * Returns null when the team isn't provisioned yet (no LiteLLM counterpart).
 * LiteLLM errors are swallowed and reported as zero usage — a flaky spend-log
 * endpoint shouldn't blank out the team admin UI.
 */
export async function getTeamUsageQuery(
  teamId: string,
  organizationId: string,
): Promise<TeamUsage | null> {
  const team = await db.team.findFirst({
    where: { id: teamId, organizationId },
    select: {
      id: true,
      litellmTeamId: true,
      budgetUsdCents: true,
      budgetDuration: true,
    },
  });

  if (!team) {
    return null;
  }

  const start = windowStart(team.budgetDuration);
  const end = new Date();

  let logs: LiteLLMSpendLog[];
  try {
    logs = await getLiteLLMSpendLogs({
      teamId: team.litellmTeamId ?? team.id,
      startDate: toIsoDate(start),
      endDate: toIsoDate(end),
    });
  } catch (error) {
    logger.warn(
      { teamId, orgId: organizationId, err: error },
      'Failed to fetch team spend logs — returning zero usage',
    );
    logs = [];
  }

  let spendUsd = 0;
  let tokenCount = 0;
  for (const log of logs) {
    spendUsd += log.spend ?? 0;
    tokenCount += log.total_tokens ?? 0;
  }

  const budgetUsd = team.budgetUsdCents / 100;
  const pctOfBudget =
    budgetUsd > 0 ? Math.min(100, (spendUsd / budgetUsd) * 100) : 0;

  return {
    teamId: team.id,
    spendUsd,
    tokenCount,
    requestCount: logs.length,
    budgetUsdCents: team.budgetUsdCents,
    budgetDuration: team.budgetDuration,
    pctOfBudget,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
  };
}

/**
 * Fetch usage for every team in the org in parallel. Teams without a
 * LiteLLM counterpart are returned with zero usage so the UI can still
 * show them alongside provisioned teams.
 */
export async function getOrgTeamsUsageQuery(
  organizationId: string,
): Promise<Record<string, TeamUsage>> {
  const teams = await db.team.findMany({
    where: { organizationId },
    select: { id: true },
  });

  const entries = await Promise.all(
    teams.map(async (t) => {
      const usage = await getTeamUsageQuery(t.id, organizationId);
      return [t.id, usage] as const;
    }),
  );

  const result: Record<string, TeamUsage> = {};
  for (const [id, usage] of entries) {
    if (usage) {
      result[id] = usage;
    }
  }
  return result;
}
