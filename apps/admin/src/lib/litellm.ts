import 'server-only';

import { createLiteLLMClient } from '@ragenai/litellm-client';

import { prisma } from './db';
import { logger } from './logger';

/**
 * This app's binding of the shared LiteLLM client (ADR-34).
 *
 * The panel previously open-coded two `fetch` calls to `/team/update`, one in
 * `limits/actions.ts` and one in `models/actions.ts`, each building its own
 * Authorization header and neither inspecting the response.
 */
const client = createLiteLLMClient({ logger });

export const {
  fetchLiteLLMModels,
  getLiteLLMHealth,
  getLiteLLMModelInfo,
  getLiteLLMTeamInfo,
  getLiteLLMSpendLogs,
  getLiteLLMKeyInfo,
  updateLiteLLMTeam,
  isLiteLLMAvailable,
} = client;

export type LiteLLMSyncResult =
  | { ok: true; teamsUpdated: number }
  | { ok: false; reason: string; teamsUpdated: number };

/**
 * Push budget and/or allowed models to **every LiteLLM team that serves this
 * organization's traffic**.
 *
 * The panel used to POST `{ team_id: orgId }`. That team exists — signup
 * creates one keyed by the organization id — but it is not the one requests go
 * through. Every organization also gets a Better Auth team, `{orgId}-general`,
 * with its own LiteLLM team and virtual key, and `resolveLiteLLMKeyQuery`
 * prefers the team key whenever the caller belongs to exactly one team, which
 * is the default shape. So the ceiling an administrator set was applied to a
 * team almost no traffic used.
 *
 * Both are updated here: the org-level team still serves users who belong to no
 * team, or to several with none active.
 *
 * Best-effort by design — the database is the source of truth and the app
 * enforces cost limits itself in `check-usage-limits-query` — but no longer
 * silent. The result says what happened so the caller can surface it.
 */
export async function syncOrgToLiteLLM(
  orgId: string,
  params: { maxBudget?: number | null; models?: string[] },
): Promise<LiteLLMSyncResult> {
  if (!process.env.LITELLM_PROXY_URL) {
    return {
      ok: false,
      reason: 'LITELLM_PROXY_URL is not set',
      teamsUpdated: 0,
    };
  }

  const teams = await prisma.team.findMany({
    where: { organizationId: orgId, litellmTeamId: { not: null } },
    select: { litellmTeamId: true },
  });

  // The org-level team is not a `Team` row — it is keyed by the organization id
  // directly, created at signup by `ensureLiteLLMTeamCommand`.
  const teamIds = [orgId, ...teams.map((t) => t.litellmTeamId!)];

  let teamsUpdated = 0;
  const failures: string[] = [];

  for (const teamId of teamIds) {
    try {
      await updateLiteLLMTeam({
        teamId,
        ...(params.maxBudget !== undefined
          ? {
              maxBudget: params.maxBudget ?? undefined,
              budgetDuration: params.maxBudget != null ? '30d' : undefined,
            }
          : {}),
        ...(params.models !== undefined ? { models: params.models } : {}),
      });
      teamsUpdated++;
    } catch (error) {
      failures.push(
        `${teamId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      reason: failures.join('; '),
      teamsUpdated,
    };
  }

  return { ok: true, teamsUpdated };
}
