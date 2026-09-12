import { Injectable } from '@nestjs/common';
import {
  orgVisibilityScope,
  type OrgVisibilityScope,
} from '@ragenai/platform-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { PiiPolicy, type Prisma } from '../generated/prisma/client.js';
import type { DocumentFolderItem } from './types.js';

export type BreadcrumbItem = { id: string; name: string };
type OperationResult = { success: true } | { success: false; error: string };

/**
 * Ported from apps/web's
 * src/features/documents/services/{commands,queries}/{create-folder-command,
 * update-folder-command,move-folder-command,get-folders-query,
 * get-folder-breadcrumbs-query,get-folder-pii-policy-query,
 * update-folder-pii-policy-command}.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * None of these needed session-derived identity in the original — every
 * method already took `organizationId` explicitly.
 */
@Injectable()
export class FoldersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves `scope`/`userTeamIds` for a caller — several documents queries
   * (`getFolders`, `FilesService.getUserFiles`/`getAllOrgFiles`) take these as
   * explicit params (apps/web's originals derived them from the session
   * server-side before calling the query). Added for `DocumentsController`
   * (see docs/adrs/21-monorepo-and-api-decoupling.md).
   *
   * The role test used to be inlined here as `role === 'admin' || role ===
   * 'owner'`, with a comment explaining that it deliberately did not import
   * apps/web's copy. It now comes from `@ragenai/platform-contracts`, which is
   * where a value three applications must resolve identically belongs —
   * ADR-33, and ADR-39 for why the answer is a scope rather than a boolean.
   */
  async getMembershipContext(
    organizationId: string,
    userId: string,
  ): Promise<{ scope: OrgVisibilityScope; userTeamIds: string[] }> {
    const [member, teamMemberships] = await Promise.all([
      this.prisma.client.member.findFirst({
        where: { organizationId, userId },
      }),
      this.prisma.client.teamMember.findMany({
        where: { userId, team: { organizationId } },
        select: { teamId: true },
      }),
    ]);

    return {
      scope: orgVisibilityScope(member?.role),
      userTeamIds: teamMemberships.map((t) => t.teamId),
    };
  }

  async createFolder(input: {
    name: string;
    organizationId: string;
    teamId?: string | null;
    parentId?: string | null;
    ownerId?: string | null;
    piiPolicy?: PiiPolicy | null;
  }) {
    const trimmedName = input.name.trim();
    if (!trimmedName || trimmedName.length > 255) {
      throw new Error('Invalid folder name');
    }

    if (input.teamId) {
      const team = await this.prisma.client.team.findFirst({
        where: { id: input.teamId, organizationId: input.organizationId },
      });
      if (!team) {
        throw new Error('Team not found in this organization');
      }
    }

    let path = '/';
    if (input.parentId) {
      const parent = await this.prisma.client.documentFolder.findFirst({
        where: { id: input.parentId, organizationId: input.organizationId },
      });
      if (!parent) {
        throw new Error('Parent folder not found');
      }
      path = `${parent.path}${parent.id}/`;
    }

    return this.prisma.client.documentFolder.create({
      data: {
        name: trimmedName,
        organizationId: input.organizationId,
        teamId: input.teamId ?? null,
        parentId: input.parentId ?? null,
        path,
        ownerId: input.ownerId ?? null,
        // An org admin creating a folder for everyone passes `ownerId: null`
        // explicitly (see CreateFolderDto). That is the *only* thing that
        // makes a folder org-wide — a null owner arriving any other way, such
        // as the owner's account being deleted, must not.
        //
        // A folder handed to a team is shared with that team, not with the
        // organization, so `teamId` excludes it. The member predicate reads
        // `{ teamId: null, isOrgWide: true }` and would not have matched it
        // either way; this keeps the column honest rather than relying on
        // every reader to remember the second half.
        isOrgWide: input.ownerId === null && !input.teamId,
        // Null when the caller chose nothing, not the fallback value.
        //
        // This used to write TOXIC_ONLY, which made every folder look like it
        // carried a deliberate policy — and the rail's tag, which renders on
        // the column being set, appeared on all of them. `getFolderPiiPolicy`
        // resolves null to TOXIC_ONLY anyway, so nothing about an upload into
        // this folder changes; what changes is that the column now records a
        // decision rather than a default.
        piiPolicy: input.piiPolicy ?? null,
      },
    });
  }

  async updateFolder(
    folderId: string,
    organizationId: string,
    data: {
      name?: string;
      teamId?: string | null;
      /** `null` clears the override and falls back to the default. */
      piiPolicy?: PiiPolicy | null;
    },
  ) {
    if (data.teamId !== undefined && data.teamId !== null) {
      if (!data.teamId) {
        throw new Error('Team ID cannot be an empty string');
      }
      const team = await this.prisma.client.team.findFirst({
        where: { id: data.teamId, organizationId },
      });
      if (!team) {
        throw new Error('Team not found in this organization');
      }
    }

    return this.prisma.client.documentFolder.update({
      where: { id: folderId, organizationId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.teamId !== undefined ? { teamId: data.teamId } : {}),
        ...(data.piiPolicy !== undefined ? { piiPolicy: data.piiPolicy } : {}),
      },
    });
  }

  async moveFolder(
    folderId: string,
    newParentId: string | null,
    organizationId: string,
  ): Promise<OperationResult> {
    const folder = await this.prisma.client.documentFolder.findFirst({
      where: { id: folderId, organizationId },
    });

    if (!folder) {
      return { success: false, error: 'Folder not found' };
    }

    let newPath = '/';
    if (newParentId !== null) {
      if (newParentId === folderId) {
        return { success: false, error: 'Cannot move a folder into itself' };
      }

      const newParent = await this.prisma.client.documentFolder.findFirst({
        where: { id: newParentId, organizationId },
      });
      if (!newParent) {
        return { success: false, error: 'Target folder not found' };
      }

      const oldPathPrefix = `${folder.path}${folder.id}/`;
      if (newParent.path.startsWith(oldPathPrefix)) {
        return {
          success: false,
          error: 'Cannot move a folder into its own subfolder',
        };
      }

      newPath = `${newParent.path}${newParent.id}/`;
    }

    const oldPathPrefix = `${folder.path}${folder.id}/`;
    const newPathPrefix = `${newPath}${folder.id}/`;

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.documentFolder.update({
          where: { id: folderId },
          data: { parentId: newParentId, path: newPath },
        });

        const descendants = await tx.documentFolder.findMany({
          where: {
            organizationId,
            path: { startsWith: oldPathPrefix },
          },
          select: { id: true, path: true },
        });

        for (const descendant of descendants) {
          const updatedPath = descendant.path.replace(
            oldPathPrefix,
            newPathPrefix,
          );
          await tx.documentFolder.update({
            where: { id: descendant.id },
            data: { path: updatedPath },
          });
        }
      });
    } catch {
      return { success: false, error: 'Failed to move folder' };
    }

    return { success: true };
  }

  async getFolders(
    organizationId: string,
    userTeamIds: string[],
    userId?: string,
    scope: OrgVisibilityScope = 'member',
  ): Promise<DocumentFolderItem[]> {
    // Assigned in branches rather than a nested ternary, which this repo's
    // ESLint config forbids.
    let whereClause: Prisma.DocumentFolderWhereInput;
    if (scope === 'none') {
      // A non-member reaches nothing, not even the org-wide folders the
      // member branch admits via `{ teamId: null, isOrgWide: true }`.
      whereClause = { id: { in: [] } };
    } else if (scope === 'organization') {
      whereClause = { organizationId };
    } else {
      whereClause = {
        organizationId,
        OR: [
          { teamId: null, isOrgWide: true },
          { ownerId: userId },
          ...(userTeamIds.length > 0 ? [{ teamId: { in: userTeamIds } }] : []),
        ],
      };
    }

    const folders = await this.prisma.client.documentFolder.findMany({
      where: whereClause,
      include: {
        team: { select: { name: true } },
        owner: { select: { name: true } },
        _count: { select: { files: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      teamId: folder.teamId,
      teamName: folder.team?.name ?? null,
      parentId: folder.parentId,
      path: folder.path,
      ownerId: folder.ownerId,
      ownerName: folder.owner?.name ?? null,
      fileCount: folder._count.files,
      piiPolicy: folder.piiPolicy,
    }));
  }

  async getFolderBreadcrumbs(
    folderId: string,
    organizationId: string,
  ): Promise<BreadcrumbItem[]> {
    const folder = await this.prisma.client.documentFolder.findFirst({
      where: { id: folderId, organizationId },
      select: { id: true, name: true, path: true },
    });

    if (!folder) {
      return [];
    }

    const ancestorIds = folder.path.split('/').filter(Boolean);

    if (ancestorIds.length === 0) {
      return [{ id: folder.id, name: folder.name }];
    }

    const ancestors = await this.prisma.client.documentFolder.findMany({
      where: { id: { in: ancestorIds }, organizationId },
      select: { id: true, name: true },
    });

    const ancestorMap = new Map(ancestors.map((a) => [a.id, a]));
    const sortedAncestors = ancestorIds
      .map((id) => ancestorMap.get(id))
      .filter((a): a is BreadcrumbItem => a !== undefined);

    sortedAncestors.push({ id: folder.id, name: folder.name });

    return sortedAncestors;
  }

  async getFolderPiiPolicy(
    folderId: string,
    organizationId: string,
  ): Promise<PiiPolicy> {
    const folder = await this.prisma.client.documentFolder.findFirst({
      where: { id: folderId, organizationId },
      select: { piiPolicy: true },
    });
    return folder?.piiPolicy ?? PiiPolicy.TOXIC_ONLY;
  }

  async updateFolderPiiPolicy(
    folderId: string,
    organizationId: string,
    piiPolicy: PiiPolicy,
  ): Promise<void> {
    const validPolicies = new Set<PiiPolicy>(
      Object.values(PiiPolicy) as PiiPolicy[],
    );
    if (!validPolicies.has(piiPolicy)) {
      throw new Error(`Invalid piiPolicy value: ${String(piiPolicy)}`);
    }
    await this.prisma.client.documentFolder.update({
      where: { id: folderId, organizationId },
      data: { piiPolicy },
    });
  }
}
