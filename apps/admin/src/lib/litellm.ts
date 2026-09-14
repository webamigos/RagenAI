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
 *
 * Those writes are gone entirely now, along with `syncOrgToLiteLLM`: budgets
 * and model allowlists are enforced by the application, so a copy in the proxy
 * could only ever be the stale one. What remains here is reading — health,
 * model info, spend — for as long as the proxy exists at all.
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
  isLiteLLMAvailable,
} = client;

export type LiteLLMSyncResult =
  | { ok: true; teamsUpdated: number }
  | { ok: false; reason: string; teamsUpdated: number };

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
