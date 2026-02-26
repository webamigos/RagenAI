'use server';

import db from '@ragenai/prisma-client';
import type { FileType } from '@/generated/prisma/client';

export const createFileCommand = async (
  file_name: string,
  file_size: number,
  organization_id: string,
  file_type: FileType,
  project_id: number | null,
) => {
  return await db.userFile.create({
    data: {
      organization_id,
      file_name,
      file_size,
      file_type,
      project_id,
    },
  });
};
