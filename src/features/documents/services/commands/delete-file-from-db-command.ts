'use server';

import db from '@ragenai/prisma-client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const deleteFileFromDbCommand = async (filePublicId: string) => {
  const orgId = await getOrgIdOrThrow();
  const result = await db.userFile.deleteMany({
    where: {
      publicId: filePublicId,
      organizationId: orgId,
    },
  });

  trackAudit({
    action: 'document.deleted',
    entityType: 'document',
    entityId: filePublicId,
  });

  return result;
};
