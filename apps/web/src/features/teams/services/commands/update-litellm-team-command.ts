import { logger } from '@/app/lib/utils/logger';
import { updateLiteLLMTeam } from '@/libs/litellm/client';
import { withLiteLLMRetry } from '@/libs/litellm/retry';
import db from '@ragenai/prisma-client';
import { provisionLiteLLMForTeamCommand } from './provision-litellm-team-command';

type UpdateInput = {
  teamId: string;
};

/**
 * Push a team's **rate limits** to its LiteLLM team.
 *
 * Budget and allowed models used to go too, and no longer do. The application
 * enforces both itself now — `assertWithinUsageLimits` before every turn, and
 * `allowedModels` filtered in `getAvailableModelsForOrganization` — so a
 * second copy in the proxy could only ever be the stale one. Keeping it
 * produced the drift the admin panel had a whole page to detect.
 *
 * `tpmLimit` and `rpmLimit` stay, because the proxy is still the only thing
 * that enforces them. That is a bridge, not a destination: LiteLLM is being
 * removed entirely, so **Phase B must replace per-team rate limiting before
 * the proxy goes** — otherwise the removal quietly takes a feature with it.
 * Recorded in the spec's Phase B, and pinned by
 * `tests/architecture/rate-limits-are-the-only-thing-synced-to-the-proxy.test.ts`.
 *
 * If the team has no LiteLLM counterpart yet, it provisions one and returns.
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
      tpmLimit: team.tpmLimit,
      rpmLimit: team.rpmLimit,
    }),
  );

  logger.info(
    { teamId: team.id, orgId: team.organizationId },
    'Synced team rate limits to the proxy',
  );
}
