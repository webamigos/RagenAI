'use server';

import db from '@ragenai/prisma-client';
import type { FileType } from '@/generated/prisma/client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';

export const createFileCommand = async (
  fileName: string,
  fileSize: number,
  organizationId: string,
  fileType: FileType,
  projectId: number | null,
) => {
  const userId = await getCurrentUserId();
  const file = await db.userFile.create({
    data: {
      organizationId,
      fileName,
      fileSize,
      fileType,
      projectId,
    },
  });

  trackAudit({
    orgId: organizationId,
    userId,
    action: 'document.uploaded',
    entityType: 'document',
    entityId: file.publicId,
    newData: { fileName, fileSize, fileType },
  });

  return file;
};
