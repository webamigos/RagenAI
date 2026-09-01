'use server';

import db from '@ragenai/prisma-client';
import type { TeamSettings } from '../../contracts/team.types';

export async function getTeamSettingsQuery(
  teamId: string,
  organizationId: string,
): Promise<TeamSettings | null> {
  const team = await db.team.findFirst({
    where: { id: teamId, organizationId },
  });

  if (!team) {
    return null;
  }

  return {
    id: team.id,
    name: team.name,
    organizationId: team.organizationId,
    budgetUsdCents: team.budgetUsdCents,
    budgetDuration: team.budgetDuration,
    rpmLimit: team.rpmLimit,
    tpmLimit: team.tpmLimit,
    allowedModels: team.allowedModels,
    litellmProvisioned:
      team.litellmTeamId != null && team.litellmKeyToken != null,
  };
}
