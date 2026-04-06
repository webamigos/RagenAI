import db from '@ragenai/prisma-client';
import type { ApiKey } from '@/generated/prisma/client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';

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

  trackAudit({
    action: 'api-key.deleted',
    entityType: 'api-key',
    entityId: apiKeyId,
    oldData: { name: apiKey.name },
  });

  return result;
};
