'use server';

import { logger } from '@/app/lib/utils/logger';
import { decryptApiKey } from '@/app/lib/utils/hashApiKey';
import db from '@ragenai/prisma-client';
import { getLiteLLMOrgApiKey } from '@/features/organizations/services/organization-settings';

type Input = {
  orgId: string;
  userId: string | null;
  activeTeamId?: string | null;
};

export type LiteLLMKeyResolution = {
  teamId: string | null;
  apiKey: string;
  source: 'team' | 'org';
};

/**
 * Resolve which LiteLLM virtual key to use for an in-UI chat request.
 *
 * Precedence:
 *   1. The session's `activeTeamId` if the caller is a member of that
 *      team AND the team has a provisioned virtual key.
 *   2. If the caller belongs to exactly one team in the org, that team's
 *      key (so the single-team case "just works" without a UI selector).
 *   3. The organization's key.
 *
 * Non-member / unprovisioned / missing teams fall through silently —
 * a compromised cookie can't route through a team you don't belong to,
 * and we prefer to charge the org key over failing the request.
 *
 * Returns null when neither a team key nor an org key is available so
 * the caller can decide whether to fall back to `LITELLM_MASTER_KEY`.
 */
export async function resolveLiteLLMKeyQuery({
  orgId,
  userId,
  activeTeamId,
}: Input): Promise<LiteLLMKeyResolution | null> {
  if (userId) {
    const resolvedTeam = await resolveTeamKey(orgId, userId, activeTeamId);
    if (resolvedTeam) {
      return resolvedTeam;
    }
  }

  const orgKey = await getLiteLLMOrgApiKey(orgId);
  if (orgKey) {
    return { teamId: null, apiKey: orgKey, source: 'org' };
  }

  return null;
}

async function resolveTeamKey(
  orgId: string,
  userId: string,
  activeTeamId: string | null | undefined,
): Promise<LiteLLMKeyResolution | null> {
  if (activeTeamId) {
    const team = await loadTeamForMember(orgId, userId, activeTeamId);
    if (team?.litellmKeyToken) {
      return {
        teamId: team.id,
        apiKey: decryptApiKey(team.litellmKeyToken),
        source: 'team',
      };
    }
    if (team && !team.litellmKeyToken) {
      logger.warn(
        { orgId, userId, teamId: activeTeamId },
        'Active team has no LiteLLM key yet — falling back',
      );
    }
  }

  const memberships = await db.teamMember.findMany({
    where: {
      userId,
      team: { organizationId: orgId, litellmKeyToken: { not: null } },
    },
    include: {
      team: {
        select: { id: true, litellmKeyToken: true },
      },
    },
    take: 2,
  });

  if (memberships.length === 1) {
    const team = memberships[0].team;
    if (team.litellmKeyToken) {
      return {
        teamId: team.id,
        apiKey: decryptApiKey(team.litellmKeyToken),
        source: 'team',
      };
    }
  }

  return null;
}

async function loadTeamForMember(
  orgId: string,
  userId: string,
  teamId: string,
): Promise<{ id: string; litellmKeyToken: string | null } | null> {
  const team = await db.team.findFirst({
    where: {
      id: teamId,
      organizationId: orgId,
      members: { some: { userId } },
    },
    select: { id: true, litellmKeyToken: true },
  });
  return team;
}
