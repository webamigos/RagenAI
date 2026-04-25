import { logger } from '@/app/lib/utils/logger';
import {
  createLiteLLMTeam,
  deleteLiteLLMTeam,
  generateLiteLLMKey,
  getLiteLLMTeamInfo,
} from '@/libs/litellm/client';
import { withLiteLLMRetry } from '@/libs/litellm/retry';
import { encryptApiKey } from '@/app/lib/utils/hashApiKey';
import db from '@ragenai/prisma-client';

type ProvisionInput = {
  teamId: string;
};

/**
 * Create a LiteLLM team + virtual key for a Better Auth Team row and
 * persist the ids back to Prisma. Idempotent: if the team already has
 * both `litellmTeamId` and `litellmKeyToken` populated, it returns a
 * no-op. If the remote team exists but the key was lost (e.g. a prior
 * crash between the two calls), it regenerates the key.
 *
 * On partial failure after the team was created but before the key is
 * persisted, the LiteLLM team is deleted so the next retry starts clean
 * and we don't leak orphaned entities in LiteLLM.
 */
export async function provisionLiteLLMForTeamCommand({
  teamId,
}: ProvisionInput): Promise<void> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    include: {
      organization: { select: { name: true, slug: true } },
    },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  if (team.litellmTeamId && team.litellmKeyToken) {
    return;
  }

  const teamAlias = buildTeamAlias(team.organization.slug, team.name);
  const maxBudget = team.budgetUsdCents / 100;

  // Idempotency: if the remote team already exists (from a prior run), skip
  // the create. /team/new returns 400 on duplicate team_id, so checking first
  // avoids a confusing retry loop.
  const existingRemote = await getLiteLLMTeamInfo(team.id);
  if (!existingRemote) {
    await withLiteLLMRetry('team.new', { teamId: team.id }, () =>
      createLiteLLMTeam({
        teamId: team.id,
        teamAlias,
        maxBudget,
        budgetDuration: team.budgetDuration,
        models: team.allowedModels.length > 0 ? team.allowedModels : undefined,
        tpmLimit: team.tpmLimit ?? undefined,
        rpmLimit: team.rpmLimit ?? undefined,
      }),
    );
    logger.info(
      { teamId: team.id, orgId: team.organizationId },
      'Provisioned LiteLLM team',
    );
  }

  let keyInfo;
  try {
    keyInfo = await withLiteLLMRetry('key.generate', { teamId: team.id }, () =>
      generateLiteLLMKey({
        teamId: team.id,
        keyAlias: `ragen-team-${team.id}`,
      }),
    );
  } catch (error) {
    // The team exists but we couldn't issue a key. Roll the team back so
    // the next attempt starts from a clean slate — a team without a key is
    // unusable anyway.
    if (!existingRemote) {
      try {
        await deleteLiteLLMTeam(team.id);
      } catch (cleanupError) {
        logger.error(
          { teamId: team.id, err: cleanupError },
          'Failed to clean up LiteLLM team after key-generation failure',
        );
      }
    }
    throw error;
  }

  try {
    await db.team.update({
      where: { id: team.id },
      data: {
        litellmTeamId: team.id,
        litellmKeyToken: encryptApiKey(keyInfo.key),
      },
    });
  } catch (dbError) {
    // DB write failed after the key was issued. Revoke the key so it can't be
    // used without a corresponding DB record, then surface the error.
    try {
      const { deleteLiteLLMKey } = await import('@/libs/litellm/client');
      await deleteLiteLLMKey(keyInfo.token);
    } catch (cleanupError) {
      logger.error(
        { teamId: team.id, keyToken: keyInfo.token, err: cleanupError },
        'Failed to revoke LiteLLM key after DB persist failure',
      );
    }
    throw dbError;
  }

  logger.info(
    { teamId: team.id, orgId: team.organizationId },
    'Persisted LiteLLM team key',
  );
}

function buildTeamAlias(
  orgSlug: string | null | undefined,
  teamName: string,
): string {
  return orgSlug ? `${orgSlug}:${teamName}` : teamName;
}
