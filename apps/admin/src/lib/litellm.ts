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
  addLiteLLMTeamMember,
  removeLiteLLMTeamMember,
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
        // `null` must survive as `null`. Coercing it to `undefined` makes
        // `updateLiteLLMTeam` omit `max_budget` from the request body, so
        // clearing a cost limit in the panel would leave the old ceiling in
        // place at the proxy — the opposite of what the administrator asked
        // for, with no error anywhere.
        ...(params.maxBudget !== undefined
          ? {
              maxBudget: params.maxBudget,
              budgetDuration: params.maxBudget != null ? '30d' : null,
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

/**
 * Add or remove a person on every LiteLLM team that serves an organization.
 *
 * apps/web does this through Better Auth's `afterAddTeamMember` /
 * `afterRemoveTeamMember` hooks. This panel does not load the `organization`
 * plugin — it would register hooks the panel has none of the machinery for —
 * so membership changes made here have to call the sync themselves. Without it
 * a member added by an administrator has no LiteLLM identity, and one removed
 * keeps spending against the team's budget.
 *
 * Best-effort like the budget sync, and for the same reason: the database
 * decides who is a member, and a proxy outage must not lose the change. The
 * result says what happened so the caller can record it.
 */
export async function syncOrgMemberToLiteLLM(
  orgId: string,
  member: { userId: string; userEmail: string },
  operation: 'add' | 'remove',
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

  if (teams.length === 0) {
    // Nothing provisioned yet. Not a failure — the team's own provisioning
    // adds its members when it runs.
    return { ok: true, teamsUpdated: 0 };
  }

  let teamsUpdated = 0;
  const failures: string[] = [];

  for (const team of teams) {
    const teamId = team.litellmTeamId!;
    try {
      if (operation === 'add') {
        await addLiteLLMTeamMember({ teamId, ...member });
      } else {
        await removeLiteLLMTeamMember({ teamId, ...member });
      }
      teamsUpdated++;
    } catch (error) {
      failures.push(
        `${teamId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    logger.error(
      { orgId, operation, failures },
      'LiteLLM team membership sync partially failed',
    );
    return { ok: false, reason: failures.join('; '), teamsUpdated };
  }

  return { ok: true, teamsUpdated };
}
