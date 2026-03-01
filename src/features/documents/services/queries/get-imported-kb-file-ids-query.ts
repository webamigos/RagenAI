'use server';

import db from '@ragenai/prisma-client';

/**
 * Returns the source file IDs (internal UUIDs) for files imported from the
 * global knowledge base into a specific project. These IDs match
 * `metadata.file_id` in Meilisearch, so they can be used in an OR filter
 * to include KB file embeddings when searching within a project.
 */
export const getImportedKbFileIdsQuery = async (
  projectId: number,
  organizationId: string,
): Promise<string[]> => {
  const imported = await db.userFile.findMany({
    where: {
      project_id: projectId,
      organization_id: organizationId,
      source_file_id: { not: null },
    },
    select: {
      source_file_id: true,
    },
  });

  return imported
    .map((f) => f.source_file_id)
    .filter((id): id is string => id !== null);
};
