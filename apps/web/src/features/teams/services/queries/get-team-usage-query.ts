'use server';

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

/**
 * Aggregate one team's spend across its current budget window.
 *
 * Reads `AiUsage`, not the proxy's spend log. Two consequences worth knowing:
 *
 * - **History starts at the `team_id` migration.** Rows written before it have
 *   no team, and are not backfilled — `Thread.teamId` would cover chat turns
 *   and nothing else, and a partial backfill understates a team's total while
 *   looking complete.
 * - **A database read fails loudly.** The proxy version swallowed errors and
 *   reported zero usage, so an unreachable proxy and a team that spent nothing
 *   looked identical — on the screen an administrator uses to decide whether a
 *   budget is working.
 *
 * Returns null when the team does not exist in this organization.
 */
export async function getTeamUsageQuery(
  teamId: string,
  organizationId: string,
): Promise<TeamUsage | null> {
  const team = await db.team.findFirst({
    where: { id: teamId, organizationId },
    select: {
      id: true,
      budgetUsdCents: true,
      budgetDuration: true,
    },
  });

  if (!team) {
    return null;
  }

  const start = windowStart(team.budgetDuration);
  const end = new Date();

  const totals = await db.aiUsage.aggregate({
    where: {
      organizationId,
      teamId: team.id,
      createdAt: { gte: start, lte: end },
    },
    _sum: { estimatedCost: true, totalTokens: true },
    _count: true,
  });

  const spendUsd = totals._sum.estimatedCost ?? 0;
  const budgetUsd = team.budgetUsdCents / 100;

  return {
    teamId: team.id,
    spendUsd,
    tokenCount: totals._sum.totalTokens ?? 0,
    requestCount: totals._count,
    budgetUsdCents: team.budgetUsdCents,
    budgetDuration: team.budgetDuration,
    pctOfBudget:
      budgetUsd > 0 ? Math.min(100, (spendUsd / budgetUsd) * 100) : 0,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
  };
}

/**
 * Usage for every team in the organization.
 *
 * One grouped query rather than one per team: the proxy version fanned out an
 * HTTP call per team, which is what made swallowing errors tempting.
 */
export async function getOrgTeamsUsageQuery(
  organizationId: string,
): Promise<Record<string, TeamUsage>> {
  const teams = await db.team.findMany({
    where: { organizationId },
    select: { id: true, budgetUsdCents: true, budgetDuration: true },
  });

  const entries = await Promise.all(
    teams.map(async (team) => {
      const usage = await getTeamUsageQuery(team.id, organizationId);
      return usage ? ([team.id, usage] as const) : null;
    }),
  );

  return Object.fromEntries(
    entries.filter((entry): entry is [string, TeamUsage] => entry !== null),
  );
}
