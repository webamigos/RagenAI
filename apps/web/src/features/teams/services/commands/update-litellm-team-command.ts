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
 * Budget and allowlist are sent as explicit clears rather than left out, so a
 * team provisioned before this change stops carrying a ceiling the application
 * no longer updates.
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
      // Cleared, not omitted. The client omits an undefined field from the
      // request body, so simply not sending these would leave whatever the
      // proxy was last told — and a team provisioned before this change is
      // still carrying a budget and an allowlist that nothing updates any
      // more. Raising a ceiling in the panel would then do nothing, and the
      // refusal would arrive from the proxy wearing this application's own
      // "usage limit" message. Sending the clears makes the proxy incapable of
      // holding a ceiling rather than merely unlikely to.
      maxBudget: null,
      budgetDuration: null,
      models: [],
      tpmLimit: team.tpmLimit,
      rpmLimit: team.rpmLimit,
    }),
  );

  logger.info(
    { teamId: team.id, orgId: team.organizationId },
    'Synced team rate limits to the proxy',
  );
}
