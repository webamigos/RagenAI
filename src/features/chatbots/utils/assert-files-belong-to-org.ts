import db from '@ragenai/prisma-client';

/**
 * Guard for `selectedFileIds` on chatbot create/update — prevents a
 * caller from persisting file IDs that belong to another organization
 * (or have been deleted). Without this check, a crafted request could
 * slip foreign file IDs into `chatbots.selected_file_ids`, and the
 * public chatbot retrieval filter would happily match them.
 *
 * Throws synchronously with a readable message when any ID is missing.
 * The action layer catches and surfaces it to the UI.
 */
export const assertFilesBelongToOrg = async (
  fileIds: readonly string[],
  organizationId: string,
): Promise<void> => {
  if (fileIds.length === 0) {
    return;
  }

  const unique = [...new Set(fileIds)];

  const matches = await db.userFile.count({
    where: {
      id: { in: unique },
      organizationId,
    },
  });

  if (matches !== unique.length) {
    throw new Error(
      `Some selected files do not belong to this organization or no longer exist (expected ${unique.length}, found ${matches})`,
    );
  }
};
