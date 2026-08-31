import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// `@qdrant/js-client-rest` is ESM-only from this project's `moduleResolution:
// nodenext` + CJS package.json's point of view despite shipping a real CJS
// build — same interop workaround as vector-store/qdrant-client.ts, don't
// "fix" this back to a static `import`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { QdrantClient } = require('@qdrant/js-client-rest');

/**
 * Ported from ragen-app's
 * src/features/documents/services/commands/sync-vector-permissions-command.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * SECURITY-SENSITIVE: `computeAccessibleBy` computes the `accessible_by`
 * Qdrant metadata array that is the actual RAG-retrieval access-control
 * boundary (see this repo's CLAUDE.md "Vector store access filtering").
 */
@Injectable()
export class VectorPermissionsService {
  private readonly logger = new Logger(VectorPermissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async computeAccessibleBy(
    fileId: string,
    organizationId: string,
  ): Promise<string[]> {
    const file = await this.prisma.client.userFile.findFirst({
      where: { id: fileId, organizationId },
      select: {
        ownerId: true,
        folderId: true,
        folder: {
          select: { id: true, teamId: true, path: true, ownerId: true },
        },
        permissions: {
          select: { granteeType: true, granteeId: true },
        },
      },
    });

    if (!file) {
      return [`org:${organizationId}`];
    }

    if (!file.ownerId) {
      return [`org:${organizationId}`];
    }

    const principals = new Set<string>();
    principals.add(`user:${file.ownerId}`);

    if (file.folder?.teamId) {
      principals.add(`team:${file.folder.teamId}`);
    }

    for (const perm of file.permissions) {
      if (perm.granteeType === 'user') {
        principals.add(`user:${perm.granteeId}`);
      } else if (perm.granteeType === 'team') {
        principals.add(`team:${perm.granteeId}`);
      }
    }

    if (file.folderId) {
      const folderPermissions =
        await this.prisma.client.documentPermission.findMany({
          where: { resourceType: 'folder', folderId: file.folderId },
          select: { granteeType: true, granteeId: true },
        });

      for (const perm of folderPermissions) {
        if (perm.granteeType === 'user') {
          principals.add(`user:${perm.granteeId}`);
        } else if (perm.granteeType === 'team') {
          principals.add(`team:${perm.granteeId}`);
        }
      }

      if (file.folder?.path && file.folder.path !== '/') {
        const ancestorIds = file.folder.path.split('/').filter(Boolean);

        if (ancestorIds.length > 0) {
          const ancestorPermissions =
            await this.prisma.client.documentPermission.findMany({
              where: { resourceType: 'folder', folderId: { in: ancestorIds } },
              select: { granteeType: true, granteeId: true },
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
   * Sync accessible_by metadata for all files in a folder and its
   * descendants. Call this after folder permission changes.
   */
  async syncFolderVectorPermissions(
    folderId: string,
    organizationId: string,
  ): Promise<void> {
    const folder = await this.prisma.client.documentFolder.findFirst({
      where: { id: folderId, organizationId },
      select: { path: true },
    });

    if (!folder) {
      return;
    }

    const descendantFolderIds = await this.prisma.client.documentFolder
      .findMany({
        where: {
          organizationId,
          path: { startsWith: `${folder.path}${folderId}/` },
        },
        select: { id: true },
      })
      .then((folders) => folders.map((f) => f.id));

    const allFolderIds = [folderId, ...descendantFolderIds];

    const files = await this.prisma.client.userFile.findMany({
      where: { organizationId, folderId: { in: allFolderIds } },
      select: { id: true },
    });

    this.logger.log(
      `Syncing vector permissions for folder (folderId=${folderId}, fileCount=${files.length})`,
    );

    const org = await this.prisma.client.organization.findUnique({
      where: { id: organizationId },
      select: { vectorStore: true },
    });

    const vectorStoreType = org?.vectorStore;

    if (!vectorStoreType || vectorStoreType === 'qdrant') {
      const qdrant = new QdrantClient({
        url: process.env.QDRANT_URL ?? 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY,
      });

      for (const file of files) {
        const accessibleBy = await this.computeAccessibleBy(
          file.id,
          organizationId,
        );
        await qdrant.setPayload(organizationId, {
          payload: { 'metadata.accessible_by': accessibleBy },
          filter: {
            must: [{ key: 'metadata.file_id', match: { value: file.id } }],
          },
          wait: true,
        });
        this.logger.debug(
          `Updated accessible_by in Qdrant (fileId=${file.id}, accessibleBy=${accessibleBy.join(',')})`,
        );
      }
    } else {
      for (const file of files) {
        const accessibleBy = await this.computeAccessibleBy(
          file.id,
          organizationId,
        );
        this.logger.debug(
          `Computed accessible_by for file, vector store update pending (fileId=${file.id}, accessibleBy=${accessibleBy.join(',')})`,
        );
      }
    }
  }
}
