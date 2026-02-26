'use server';

import { randomUUID } from 'node:crypto';
import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getProjectByPublicIdOrThrowQuery } from '@/features/projects/services/queries/get-project-query';
import { logger } from '@/app/lib/utils/logger';

/**
 * Imports a file from the global knowledge base into a project.
 * Creates a lightweight UserFile record that references the source file via
 * `source_file_id`. No re-embedding is needed — the RAG chain uses an OR
 * filter to include the source file's existing Meilisearch embeddings.
 */
export const importFileToProjectCommand = async (
  sourceFilePublicId: string,
  targetProjectPublicId: string,
) => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const targetProject = await getProjectByPublicIdOrThrowQuery(
    targetProjectPublicId,
  );

  if (targetProject.organization_id !== orgId) {
    throw new Error('Cannot import file to a project in another organization');
  }

  const sourceFile = await db.userFile.findFirst({
    where: {
      public_id: sourceFilePublicId,
      organization_id: orgId,
    },
  });

  if (!sourceFile) {
    throw new Error('Source file not found');
  }

  // Check if file already exists in target project (by source reference or name)
  const existingFile = await db.userFile.findFirst({
    where: {
      organization_id: orgId,
      project_id: targetProject.id,
      OR: [
        { source_file_id: sourceFile.id },
        { file_name: sourceFile.file_name },
      ],
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
      source_file_id: sourceFile.id,
      // Inherit source file's status — no re-embedding needed
      parsing_status: sourceFile.parsing_status,
      embedding_status: sourceFile.embedding_status,
      parsing_completed_at: sourceFile.parsing_completed_at,
      embedding_completed_at: sourceFile.embedding_completed_at,
    },
  });

  logger.info(
    {
      sourceFileId: sourceFile.id,
      sourceFilePublicId: sourceFile.public_id,
      newFileId: newPublicId,
      targetProjectId: targetProject.id,
    },
    'File imported to project from knowledge base',
  );

  return { alreadyExists: false, file: newFile };
};
