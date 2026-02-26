'use server';

import { randomUUID } from 'node:crypto';
import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getProjectByPublicIdOrThrowQuery } from '@/features/projects/services/queries/get-project-query';
import { logger } from '@/app/lib/utils/logger';

/**
 * Imports (copies) an existing file from one project to another.
 * Creates a new UserFile record in the target project pointing to the same content.
 * A Temporal workflow should be triggered afterward to re-embed.
 */
export const importFileToProjectCommand = async (
  sourceFilePublicId: string,
  targetProjectPublicId: string,
) => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const targetProject = await getProjectByPublicIdOrThrowQuery(
    targetProjectPublicId,
  );

  const sourceFile = await db.userFile.findFirst({
    where: {
      public_id: sourceFilePublicId,
      organization_id: orgId,
    },
  });

  if (!sourceFile) {
    throw new Error('Source file not found');
  }

  // Check if file already exists in target project (by name)
  const existingFile = await db.userFile.findFirst({
    where: {
      organization_id: orgId,
      project_id: targetProject.id,
      file_name: sourceFile.file_name,
    },
  });

  if (existingFile) {
    return { alreadyExists: true, file: existingFile };
  }

  const newPublicId = randomUUID();

  const newFile = await db.userFile.create({
    data: {
      public_id: newPublicId,
      organization_id: orgId,
      file_name: sourceFile.file_name,
      file_size: sourceFile.file_size,
      file_type: sourceFile.file_type,
      metadata: sourceFile.metadata ?? {},
      project_id: targetProject.id,
      is_uploaded: sourceFile.is_uploaded,
      uploaded_at: sourceFile.uploaded_at,
      is_binary_file: sourceFile.is_binary_file,
      file_extension: sourceFile.file_extension,
      file_mime_type: sourceFile.file_mime_type,
      // Reset processing status — temporal workflow needed
      parsing_status: 'NOT_STARTED',
      embedding_status: 'NOT_STARTED',
    },
  });

  logger.info(
    {
      sourceFileId: sourceFile.public_id,
      newFileId: newPublicId,
      targetProjectId: targetProject.id,
    },
    'File imported to project',
  );

  return { alreadyExists: false, file: newFile };
};
