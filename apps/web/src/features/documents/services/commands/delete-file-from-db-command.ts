'use server';

import db from '@ragenai/prisma-client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

import { NOT_A_BRAIN_VEHICLE } from './not-a-brain-vehicle';

export const deleteFileFromDbCommand = async (fileId: string) => {
  const orgId = await getOrgIdOrThrow();
  const result = await db.userFile.deleteMany({
    where: {
      id: fileId,
      organizationId: orgId,
      ...NOT_A_BRAIN_VEHICLE,
    },
  });

  trackAudit({
    action: 'document.deleted',
    entityType: 'document',
    entityId: fileId,
  });

  return result;
};
