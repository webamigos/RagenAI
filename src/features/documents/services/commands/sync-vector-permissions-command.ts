'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Compute the accessible_by array for a file based on its ownership,
 * folder assignment, team association, and explicit permissions.
 *
 * Returns an array of principal strings like:
 * - "org:<orgId>" — visible to all org members
 * - "user:<userId>" — visible to specific user
 * - "team:<teamId>" — visible to team members
 */
export async function computeAccessibleBy(
  fileId: string,
  organizationId: string,
): Promise<string[]> {
  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId },
    select: {
      ownerId: true,
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

  if (!file) {
    return [`org:${organizationId}`];
  }

  // Legacy file (no owner): accessible to all org members
  if (!file.ownerId) {
    return [`org:${organizationId}`];
  }

  const principals = new Set<string>();

  // Owner always has access
  principals.add(`user:${file.ownerId}`);

  // Team folder access
  if (file.folder?.teamId) {
    principals.add(`team:${file.folder.teamId}`);
  }

  // Direct file permissions
  for (const perm of file.permissions) {
    if (perm.granteeType === 'user') {
      principals.add(`user:${perm.granteeId}`);
    } else if (perm.granteeType === 'team') {
      principals.add(`team:${perm.granteeId}`);
    }
  }

  // Folder-level permissions (check the folder and its ancestors)
  if (file.folderId) {
    const folderPermissions = await db.documentPermission.findMany({
      where: {
        resourceType: 'folder',
        folderId: file.folderId,
      },
      select: {
        granteeType: true,
        granteeId: true,
      },
    });

    for (const perm of folderPermissions) {
      if (perm.granteeType === 'user') {
        principals.add(`user:${perm.granteeId}`);
      } else if (perm.granteeType === 'team') {
        principals.add(`team:${perm.granteeId}`);
      }
    }

    // Also check ancestor folder permissions via path
    if (file.folder?.path && file.folder.path !== '/') {
      const ancestorIds = file.folder.path.split('/').filter(Boolean);

      if (ancestorIds.length > 0) {
        const ancestorPermissions = await db.documentPermission.findMany({
          where: {
            resourceType: 'folder',
            folderId: { in: ancestorIds },
          },
          select: {
            granteeType: true,
            granteeId: true,
          },
        });

        for (const perm of ancestorPermissions) {
          if (perm.granteeType === 'user') {
            principals.add(`user:${perm.granteeId}`);
          } else if (perm.granteeType === 'team') {
            principals.add(`team:${perm.granteeId}`);
          }
        }
      }
    }
  }

  return Array.from(principals);
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
