import { logger } from '@/app/lib/utils/logger';
import {
  createLiteLLMTeam,
  generateLiteLLMKey,
  getLiteLLMTeamInfo,
} from '@/libs/litellm/client';
import { encryptApiKey } from '@/app/lib/utils/hashApiKey';
import db from '@ragenai/prisma-client';
import { getUsageLimits } from '../organization-settings';

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
      // Explicitly nothing enforceable. This used to set a 30-day budget
      // window, which outlived the budgets that went with it — the
      // application enforces ceilings now, and a window at the proxy is one
      // more thing that has to be remembered when the proxy goes.
      maxBudget: null,
      budgetDuration: null,
      models: [],
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
