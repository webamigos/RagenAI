'use server';

import db from '@ragenai/prisma-client';
import type { FileType } from '@/generated/prisma/client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';

export const createFileCommand = async (
  fileName: string,
  fileSize: number,
  organizationId: string,
  fileType: FileType,
  projectId: number | null,
  options?: { folderId?: number | null; ownerId?: string | null },
) => {
  const file = await db.userFile.create({
    data: {
      organizationId,
      fileName,
      fileSize,
      fileType,
      projectId,
      folderId: options?.folderId ?? null,
      ownerId: options?.ownerId ?? null,
    },
  });

  trackAudit({
    action: 'document.uploaded',
    entityType: 'document',
    entityId: file.publicId,
    newData: { fileName, fileSize, fileType },
  });

  return file;
};
