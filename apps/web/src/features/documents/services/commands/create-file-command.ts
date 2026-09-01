'use server';

import db from '@ragenai/prisma-client';
import type { FileType, PiiPolicy } from '@/generated/prisma/client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';

export const createFileCommand = async (
  fileName: string,
  fileSize: number,
  organizationId: string,
  fileType: FileType,
  projectId: string | null,
  options?: {
    folderId?: string | null;
    ownerId?: string | null;
    fileExtension?: string | null;
    fileMimeType?: string | null;
    piiPolicy?: PiiPolicy | null;
  },
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
      fileExtension: options?.fileExtension ?? null,
      fileMimeType: options?.fileMimeType ?? null,
      ...(options?.piiPolicy ? { piiPolicy: options.piiPolicy } : {}),
    },
  });

  trackAudit({
    action: 'document.uploaded',
    entityType: 'document',
    entityId: file.id,
    newData: { fileName, fileSize, fileType },
  });

  return file;
};
