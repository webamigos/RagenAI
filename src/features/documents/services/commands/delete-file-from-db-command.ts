'use server';

import db from '@ragenai/prisma-client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import {
  getOrgIdFromAuthOrThrow as getOrgIdOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';

export const deleteFileFromDbCommand = async (filePublicId: string) => {
  const [orgId, userId] = await Promise.all([
    getOrgIdOrThrow(),
    getCurrentUserId(),
  ]);
  const result = await db.userFile.deleteMany({
    where: {
      publicId: filePublicId,
      organizationId: orgId,
    },
  });

  trackAudit({
    orgId,
    userId,
    action: 'document.deleted',
    entityType: 'document',
    entityId: filePublicId,
  });

  return result;
};
