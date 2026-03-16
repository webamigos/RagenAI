'use server';

import db from '@ragenai/prisma-client';
import type { FileType } from '@/generated/prisma/client';

export const createFileCommand = async (
  fileName: string,
  fileSize: number,
  organizationId: string,
  fileType: FileType,
  projectId: number | null,
) => {
  return await db.userFile.create({
    data: {
      organizationId,
      fileName,
      fileSize,
      fileType,
      projectId,
    },
  });
};
