import { randomBytes } from 'node:crypto';
import db from '@ragenai/prisma-client';
import { getRagenAuthClient } from '@/libs/ragen-vault/client';
import { maskApiKey } from '@/app/lib/utils/hashApiKey';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';
import { logger } from '@/app/lib/utils/logger';

const VAULT_PROVIDER = 'ragen-api-key';
const KEY_PREFIX = 'sk-';

type CreateApiKeyInput = {
  orgId: string;
  userId: string;
  name: string;
  projectId: string;
  debugMode?: boolean;
};

type CreateApiKeyResult = {
  id: string;
  name: string;
  maskedValue: string;
  fullKey: string;
};

function generateApiKey(keyId: string): string {
  const secret = randomBytes(32).toString('base64url');
  return `${KEY_PREFIX}${keyId}.${secret}`;
}

export const createApiKeyCommand = async (
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> => {
  const { orgId, userId, name, projectId, debugMode } = input;

  // Create the DB record first to get the UUID
  const apiKey = await db.apiKey.create({
    data: {
      name,
      maskedValue: '', // placeholder, updated below
      organizationId: orgId,
      projectId,
      createdBy: userId,
      debugMode: debugMode ?? false,
    },
  });

  let vaultWritten = false;
  try {
    const fullKey = generateApiKey(apiKey.id);
    const maskedValue = maskApiKey(fullKey);

    // Store the full key in vault
    await getRagenAuthClient().storeToken(
      `api-key-${apiKey.id}`,
      VAULT_PROVIDER,
      { accessToken: fullKey },
    );
    vaultWritten = true;

    // Update the masked value in DB
    await db.apiKey.update({
      where: { id: apiKey.id },
      data: { maskedValue },
    });

    trackAudit({
      action: 'api-key.created',
      entityType: 'api-key',
      entityId: apiKey.id,
      newData: { name, projectId, debugMode: debugMode ?? false },
    });

    recordSecurityEvent({
      eventType: 'API_KEY_CREATED',
      severity: 'info',
      source: 'admin',
      organizationId: orgId,
      userId,
      metadata: {
        apiKeyId: apiKey.id,
        projectId,
        keyName: name,
      },
    });

    return { id: apiKey.id, name, maskedValue, fullKey };
  } catch (error) {
    // Cleanup orphaned vault entry if vault write succeeded but DB update failed
    if (vaultWritten) {
      await getRagenAuthClient()
        .deleteToken(`api-key-${apiKey.id}`, VAULT_PROVIDER)
        .catch((vaultErr) => {
          logger.error(
            { err: vaultErr, apiKeyId: apiKey.id },
            'Failed to cleanup orphaned vault entry',
          );
        });
    }
    // Cleanup orphaned DB record
    await db.apiKey.delete({ where: { id: apiKey.id } }).catch((cleanupErr) => {
      logger.error({ err: cleanupErr }, 'Failed to cleanup orphaned API key');
    });
    throw error;
  }
};
