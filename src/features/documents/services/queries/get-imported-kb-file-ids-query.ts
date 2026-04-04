'use server';

import db from '@ragenai/prisma-client';

/**
 * Returns the source file IDs (internal UUIDs) for files imported from the
 * global knowledge base into a specific project. These IDs match
 * `metadata.fileId` in Meilisearch, so they can be used in an OR filter
 * to include KB file embeddings when searching within a project.
 */
export const getImportedKbFileIdsQuery = async (
  projectId: number,
  organizationId: string,
): Promise<number[]> => {
  const imported = await db.userFile.findMany({
    where: {
      projectId: projectId,
      organizationId: organizationId,
      sourceFileId: { not: null },
    },
    select: {
      sourceFileId: true,
    },
  });

  return imported
    .map((f) => f.sourceFileId)
    .filter((id): id is number => id !== null);
};
