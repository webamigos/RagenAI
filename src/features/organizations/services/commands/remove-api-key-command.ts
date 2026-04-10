import db from '@ragenai/prisma-client';
import type { ApiKey } from '@/generated/prisma/client';
import { getRagenAuthClient } from '@/libs/ragen-vault/client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { logger } from '@/app/lib/utils/logger';

const VAULT_PROVIDER = 'ragen-api-key';

export const removeApiKeyCommand = async (
  organizationId: string,
  apiKeyId: ApiKey['id'],
) => {
  const apiKey = await db.apiKey.findUniqueOrThrow({
    where: {
      id: apiKeyId,
      organizationId: organizationId,
    },
  });

  const result = await db.apiKey.delete({
    where: {
      id: apiKey.id,
    },
  });

  // Delete the key from vault (best-effort, don't fail the operation)
  getRagenAuthClient()
    .deleteToken(`api-key-${apiKeyId}`, VAULT_PROVIDER)
    .catch((error) => {
      logger.error(
        { err: error, apiKeyId },
        'Failed to delete API key from vault',
      );
    });

  trackAudit({
    action: 'api-key.deleted',
    entityType: 'api-key',
    entityId: apiKeyId,
    oldData: { name: apiKey.name },
  });

  return result;
};
