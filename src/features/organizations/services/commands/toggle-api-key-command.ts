import db from '@ragenai/prisma-client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';

export const toggleApiKeyCommand = async (
  organizationId: string,
  apiKeyId: string,
  isActive: boolean,
) => {
  const apiKey = await db.apiKey.update({
    where: {
      id: apiKeyId,
      organizationId,
    },
    data: { isActive },
  });

  trackAudit({
    action: isActive ? 'api-key.activated' : 'api-key.deactivated',
    entityType: 'api-key',
    entityId: apiKeyId,
    newData: { isActive },
  });

  return apiKey;
};
