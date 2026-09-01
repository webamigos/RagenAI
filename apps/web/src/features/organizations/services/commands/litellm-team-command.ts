import { logger } from '@/app/lib/utils/logger';
import {
  createLiteLLMTeam,
  generateLiteLLMKey,
  getLiteLLMTeamInfo,
  updateLiteLLMTeam,
} from '@/libs/litellm/client';
import { encryptApiKey } from '@/app/lib/utils/hashApiKey';
import db from '@ragenai/prisma-client';
import { getUsageLimits, getAllowedModels } from '../organization-settings';

/**
 * Create a LiteLLM team + virtual key for an organization.
 * Idempotent: skips if team already exists and org already has a key.
 */
export async function ensureLiteLLMTeamCommand(
  orgId: string,
  orgName: string,
): Promise<void> {
  const existing = await getLiteLLMTeamInfo(orgId);

  if (!existing) {
    await createLiteLLMTeam({
      teamId: orgId,
      teamAlias: orgName,
      budgetDuration: '30d',
    });
    logger.info({ orgId }, 'Created LiteLLM team');
  }

  // Check if org already has a key stored
  const settings = await db.organizationSettings.findUnique({
    where: { organizationId: orgId },
    select: { litellmApiKey: true },
  });

  if (settings?.litellmApiKey) {
    return;
  }

  // Generate a virtual key for this team
  const keyInfo = await generateLiteLLMKey({
    teamId: orgId,
    keyAlias: `ragen-${orgId}`,
  });

  const encryptedKey = encryptApiKey(keyInfo.key);

  try {
    await db.organizationSettings.upsert({
      where: { organizationId: orgId },
      update: { litellmApiKey: encryptedKey },
      create: { organizationId: orgId, litellmApiKey: encryptedKey },
    });
  } catch (dbError) {
    // Clean up orphaned LiteLLM key if DB write fails
    try {
      const { deleteLiteLLMKey } = await import('@/libs/litellm/client');
      await deleteLiteLLMKey(keyInfo.token);
    } catch {
      logger.error(
        { orgId, keyToken: keyInfo.token },
        'Failed to clean up orphaned LiteLLM key after DB error',
      );
    }
    throw dbError;
  }

  logger.info({ orgId }, 'Generated and stored LiteLLM virtual key');
}

/**
 * Sync the organization's cost limit to LiteLLM team max_budget.
 * Converts monthlyCostLimitCents to USD.
 */
export async function syncLiteLLMTeamBudgetCommand(
  orgId: string,
): Promise<void> {
  const limits = await getUsageLimits(orgId);

  const maxBudget =
    limits.monthlyCostLimitCents != null
      ? limits.monthlyCostLimitCents / 100
      : null;

  await updateLiteLLMTeam({
    teamId: orgId,
    maxBudget,
    budgetDuration: maxBudget != null ? '30d' : null,
  });

  logger.info({ orgId, maxBudget }, 'Synced LiteLLM team budget');
}

/**
 * Sync the organization's allowed models to LiteLLM team.
 */
export async function syncLiteLLMTeamModelsCommand(
  orgId: string,
): Promise<void> {
  const allowedModels = await getAllowedModels(orgId);

  await updateLiteLLMTeam({
    teamId: orgId,
    models: allowedModels,
  });

  logger.info(
    { orgId, modelCount: allowedModels.length },
    'Synced LiteLLM team models',
  );
}
