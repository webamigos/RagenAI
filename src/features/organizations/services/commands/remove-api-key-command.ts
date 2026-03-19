import db from '@ragenai/prisma-client';
import type { ApiKey } from '@/generated/prisma/client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';

export const removeApiKeyCommand = async (
  organizationId: string,
  publicApiKeyId: ApiKey['publicId'],
) => {
  const apiKey = await db.apiKey.findUniqueOrThrow({
    where: {
      publicId: publicApiKeyId,
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
    entityId: publicApiKeyId,
    oldData: { name: apiKey.name },
  });

  return result;
};
