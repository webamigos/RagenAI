import { randomBytes } from 'node:crypto';
import db from '@ragenai/prisma-client';
import { getRagenAuthClient } from '@/libs/ragen-vault/client';
import { maskApiKey } from '@/app/lib/utils/hashApiKey';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { logger } from '@/app/lib/utils/logger';

const VAULT_PROVIDER = 'ragen-api-key';
const KEY_PREFIX = 'sk-';

type CreateApiKeyInput = {
  orgId: string;
  userId: string;
  name: string;
  projectId: string;
};

type CreateApiKeyResult = {
  id: string;
  name: string;
  maskedValue: string;
  fullKey: string;
};

function generateApiKey(
  orgId: string,
  userId: string,
  projectId: string,
  keyId: string,
): string {
  const randomPart = randomBytes(32).toString('base64url');
  const content = `${randomPart} ${orgId} ${userId} ${projectId} ${keyId}`;
  return `${KEY_PREFIX}${Buffer.from(content).toString('base64url')}`;
}

export const createApiKeyCommand = async (
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> => {
  const { orgId, userId, name, projectId } = input;

  // Create the DB record first to get the UUID
  const apiKey = await db.apiKey.create({
    data: {
      name,
      maskedValue: '', // placeholder, updated below
      organizationId: orgId,
      projectId,
      createdBy: userId,
    },
  });

  try {
    const fullKey = generateApiKey(orgId, userId, projectId, apiKey.id);
    const maskedValue = maskApiKey(fullKey);

    // Store the full key in vault
    await getRagenAuthClient().storeToken(
      `api-key-${apiKey.id}`,
      VAULT_PROVIDER,
      { accessToken: fullKey },
    );

    // Update the masked value in DB
    await db.apiKey.update({
      where: { id: apiKey.id },
      data: { maskedValue },
    });

    trackAudit({
      action: 'api-key.created',
      entityType: 'api-key',
      entityId: apiKey.id,
      newData: { name, projectId },
    });

    return { id: apiKey.id, name, maskedValue, fullKey };
  } catch (error) {
    // Cleanup orphaned DB record on vault/update failure
    await db.apiKey.delete({ where: { id: apiKey.id } }).catch((cleanupErr) => {
      logger.error({ err: cleanupErr }, 'Failed to cleanup orphaned API key');
    });
    throw error;
  }
};
