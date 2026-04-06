'use server';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getProjectByIdOrThrowQuery } from '@/features/projects/services/queries/get-project-query';
import { logger } from '@/app/lib/utils/logger';

/**
 * Imports a file from the global knowledge base into a project.
 * Creates a lightweight UserFile record that references the source file via
 * `sourceFileId`. No re-embedding is needed — the RAG chain uses an OR
 * filter to include the source file's existing Meilisearch embeddings.
 */
export const importFileToProjectCommand = async (
  sourceFileId: string,
  targetProjectId: string,
) => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const targetProject = await getProjectByIdOrThrowQuery(targetProjectId);

  if (targetProject.organizationId !== orgId) {
    throw new Error('Cannot import file to a project in another organization');
  }

  const sourceFile = await db.userFile.findFirst({
    where: {
      id: sourceFileId,
      organizationId: orgId,
    },
  });

  if (!sourceFile) {
    throw new Error('Source file not found');
  }

  // Check if file already exists in target project (by source reference or name)
  const existingFile = await db.userFile.findFirst({
    where: {
      organizationId: orgId,
      projectId: targetProject.id,
      OR: [{ sourceFileId: sourceFile.id }, { fileName: sourceFile.fileName }],
    },
  });

  if (existingFile) {
    return { alreadyExists: true, file: existingFile };
  }

  const newFile = await db.userFile.create({
    data: {
      organizationId: orgId,
      fileName: sourceFile.fileName,
      fileSize: sourceFile.fileSize,
      fileType: sourceFile.fileType,
      metadata: sourceFile.metadata ?? {},
      projectId: targetProject.id,
      isUploaded: sourceFile.isUploaded,
      uploadedAt: sourceFile.uploadedAt,
      isBinaryFile: sourceFile.isBinaryFile,
      fileExtension: sourceFile.fileExtension,
      fileMimeType: sourceFile.fileMimeType,
      sourceFileId: sourceFile.id,
      // Inherit source file's status — no re-embedding needed
      parsingStatus: sourceFile.parsingStatus,
      embeddingStatus: sourceFile.embeddingStatus,
      parsingCompletedAt: sourceFile.parsingCompletedAt,
      embeddingCompletedAt: sourceFile.embeddingCompletedAt,
    },
  });

  logger.info(
    {
      sourceFileId: sourceFile.id,
      newFileId: newFile.id,
      targetProjectId: targetProject.id,
    },
    'File imported to project from knowledge base',
  );

  return { alreadyExists: false, file: newFile };
};
