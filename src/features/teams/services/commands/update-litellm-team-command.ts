import { logger } from '@/app/lib/utils/logger';
import { updateLiteLLMTeam } from '@/libs/litellm/client';
import { withLiteLLMRetry } from '@/libs/litellm/retry';
import db from '@ragenai/prisma-client';
import { provisionLiteLLMForTeamCommand } from './provision-litellm-team-command';

type UpdateInput = {
  teamId: string;
};

/**
 * Sync a Better Auth Team row's budget, limits, and allowed-model whitelist
 * to its LiteLLM team. If the team has no LiteLLM counterpart yet (legacy
 * row from before this feature shipped), it provisions one and returns —
 * since provision already uses the current Team fields.
 */
export async function updateLiteLLMForTeamCommand({
  teamId,
}: UpdateInput): Promise<void> {
  const team = await db.team.findUnique({ where: { id: teamId } });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  if (!team.litellmTeamId) {
    await provisionLiteLLMForTeamCommand({ teamId });
    return;
  }

  await withLiteLLMRetry('team.update', { teamId: team.id }, () =>
    updateLiteLLMTeam({
      teamId: team.litellmTeamId!,
      maxBudget: team.budgetUsdCents / 100,
      budgetDuration: team.budgetDuration,
      models: team.allowedModels.length > 0 ? team.allowedModels : [],
      tpmLimit: team.tpmLimit,
      rpmLimit: team.rpmLimit,
    }),
  );

  logger.info(
    { teamId: team.id, orgId: team.organizationId },
    'Synced LiteLLM team settings',
  );
}
