import { logger } from '@/app/lib/utils/logger';
import {
  addLiteLLMTeamMember,
  removeLiteLLMTeamMember,
} from '@/libs/litellm/client';
import { withLiteLLMRetry } from '@/libs/litellm/retry';
import db from '@ragenai/prisma-client';

type MemberAddInput = {
  teamId: string;
  organizationId: string;
  userId: string;
  userEmail?: string;
};

type MemberRemoveInput = {
  teamId: string;
  organizationId: string;
  userId: string;
  userEmail?: string;
};

async function getLiteLLMTeamIdOrSkip(
  teamId: string,
  organizationId: string,
): Promise<string | null> {
  const team = await db.team.findFirst({
    where: { id: teamId, organizationId },
    select: { litellmTeamId: true },
  });
  // A team without a LiteLLM counterpart can't sync members — a future
  // provision run will backfill membership from Prisma, so bailing here
  // is safe. Cross-org lookups also return null here.
  return team?.litellmTeamId ?? null;
}

export async function syncLiteLLMTeamMemberAddCommand({
  teamId,
  organizationId,
  userId,
  userEmail,
}: MemberAddInput): Promise<void> {
  const litellmTeamId = await getLiteLLMTeamIdOrSkip(teamId, organizationId);
  if (!litellmTeamId) {
    logger.warn(
      { teamId, userId },
      'Skipping LiteLLM member add — team has no LiteLLM counterpart yet',
    );
    return;
  }

  await withLiteLLMRetry('team.member_add', { teamId, userId }, () =>
    addLiteLLMTeamMember({ teamId: litellmTeamId, userId, userEmail }),
  );

  logger.info({ teamId, userId }, 'Added member to LiteLLM team');
}

export async function syncLiteLLMTeamMemberRemoveCommand({
  teamId,
  organizationId,
  userId,
  userEmail,
}: MemberRemoveInput): Promise<void> {
  const litellmTeamId = await getLiteLLMTeamIdOrSkip(teamId, organizationId);
  if (!litellmTeamId) {
    return;
  }

  await withLiteLLMRetry('team.member_delete', { teamId, userId }, () =>
    removeLiteLLMTeamMember({ teamId: litellmTeamId, userId, userEmail }),
  );

  logger.info({ teamId, userId }, 'Removed member from LiteLLM team');
}
