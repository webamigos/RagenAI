import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// A `require()` while apps/api was CommonJS — see the note in
// vector-store/qdrant-client.ts.
import { QdrantClient } from '@qdrant/js-client-rest';
import { computeAccessiblePrincipals } from '@ragenai/rag-core';

/**
 * Ported from apps/web's
 * src/features/documents/services/commands/sync-vector-permissions-command.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * SECURITY-SENSITIVE: `computeAccessibleBy` computes the `accessible_by`
 * Qdrant metadata array that is the actual RAG-retrieval access-control
 * boundary (see this repo's AGENTS.md "Vector store access filtering").
 */
@Injectable()
export class VectorPermissionsService {
  private readonly logger = new Logger(VectorPermissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The principals allowed to retrieve this file's chunks.
   *
   * Reads the rows; the rule itself is `computeAccessiblePrincipals` in
   * `@ragenai/rag-core`, shared with apps/web and with the worker's ingest so
   * the three cannot drift. The docblock there records what the drift was.
   */
  async computeAccessibleBy(
    fileId: string,
    organizationId: string,
  ): Promise<string[]> {
    const file = await this.prisma.client.userFile.findFirst({
      where: { id: fileId, organizationId },
      select: {
        ownerId: true,
        isOrgWide: true,
        folderId: true,
        folder: {
          select: { id: true, teamId: true, path: true, ownerId: true },
        },
        permissions: {
          select: { granteeType: true, granteeId: true },
        },
      },
    });

    // No such file in this organization. Nothing to widen it to.
    if (!file) {
      return [];
    }

    const grants = [...file.permissions];

    // Folder-level permissions, and those of the folder's ancestors.
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
      const folderPermissions =
        await this.prisma.client.documentPermission.findMany({
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
        // See QdrantVectorStoreClient: the check is an un-awaited request
        // that only warns.
        checkCompatibility: false,
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
