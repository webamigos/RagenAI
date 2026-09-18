'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { QdrantClient } from '@qdrant/js-client-rest';
import { computeAccessiblePrincipals } from '@ragenai/rag-core';

/**
 * Compute the `accessible_by` array for a file — the principals allowed to
 * retrieve its chunks.
 *
 * Reads the rows; the rule itself is `computeAccessiblePrincipals` in
 * `@ragenai/rag-core`, shared with apps/api and with the worker's ingest so
 * the three cannot drift. The docblock there records what the drift was.
 */
export async function computeAccessibleBy(
  fileId: string,
  organizationId: string,
): Promise<string[]> {
  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId },
    select: {
      ownerId: true,
      isOrgWide: true,
      folderId: true,
      folder: {
        select: {
          id: true,
          teamId: true,
          path: true,
          ownerId: true,
        },
      },
      permissions: {
        select: {
          granteeType: true,
          granteeId: true,
        },
      },
    },
  });

  // No such file in this organization. Nothing to widen it to.
  if (!file) {
    return [];
  }

  const grants = [...file.permissions];

  // Folder-level permissions, and those of the folder's ancestors — inherited
  // rather than copied onto each file, so this is what makes a folder share
  // mean anything.
  if (file.folderId) {
    const folderIds = [file.folderId];
    if (file.folder?.path && file.folder.path !== '/') {
      folderIds.push(...file.folder.path.split('/').filter(Boolean));
    }

    // `DocumentPermission` carries no organization column — it is scoped
    // through its relation to the file or folder, which is the shape the
    // tenant-scope guard cannot check. The scope holds here because every id
    // in `folderIds` comes from the org-scoped file row above: its own
    // `folderId`, and the ancestor ids in that folder's materialized path,
    // which is built within one organization. Do not widen this to a caller-
    // supplied folder id without adding an organization filter.
    const folderPermissions = await db.documentPermission.findMany({
      where: { resourceType: 'folder', folderId: { in: folderIds } },
      select: { granteeType: true, granteeId: true },
    });
    grants.push(...folderPermissions);
  }

  return computeAccessiblePrincipals({
    organizationId,
    ownerId: file.ownerId,
    isOrgWide: file.isOrgWide,
    folderTeamId: file.folder?.teamId ?? null,
    grants,
  });
}

/**
 * Sync accessible_by metadata for all files in a folder and its descendants.
 * Call this after folder permission changes.
 */
export async function syncFolderVectorPermissions(
  folderId: string,
  organizationId: string,
): Promise<void> {
  const folder = await db.documentFolder.findFirst({
    where: { id: folderId, organizationId },
    select: { path: true },
  });

  if (!folder) {
    return;
  }

  // Find all files in this folder and descendants
  const descendantFolderIds = await db.documentFolder
    .findMany({
      where: {
        organizationId,
        path: { startsWith: `${folder.path}${folderId}/` },
      },
      select: { id: true },
    })
    .then((folders) => folders.map((f) => f.id));

  const allFolderIds = [folderId, ...descendantFolderIds];

  const files = await db.userFile.findMany({
    where: {
      organizationId,
      folderId: { in: allFolderIds },
    },
    select: { id: true },
  });

  logger.info(
    { folderId, fileCount: files.length },
    'Syncing vector permissions for folder',
  );

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { vectorStore: true },
  });

  const vectorStoreType = org?.vectorStore;

  if (!vectorStoreType || vectorStoreType === 'qdrant') {
    const qdrant = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
    });

    for (const file of files) {
      const accessibleBy = await computeAccessibleBy(file.id, organizationId);
      await qdrant.setPayload(organizationId, {
        payload: { 'metadata.accessible_by': accessibleBy },
        filter: {
          must: [{ key: 'metadata.file_id', match: { value: file.id } }],
        },
        wait: true,
      });
      logger.debug(
        { fileId: file.id, accessibleBy },
        'Updated accessible_by in Qdrant',
      );
    }
  } else {
    // Meilisearch or other — log for now
    for (const file of files) {
      const accessibleBy = await computeAccessibleBy(file.id, organizationId);
      logger.debug(
        { fileId: file.id, accessibleBy },
        'Computed accessible_by for file (vector store update pending)',
      );
    }
  }
}
