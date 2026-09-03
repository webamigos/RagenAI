import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type {
  DocumentPermissionItem,
  ResourceType,
  GranteeType,
  PermissionLevel,
} from './types.js';

type ShareFileParams = {
  resourceType: 'file';
  fileId: string;
  organizationId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: PermissionLevel;
  grantedBy: string;
};

type ShareFolderParams = {
  resourceType: 'folder';
  folderId: string;
  organizationId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: PermissionLevel;
  grantedBy: string;
};

type ShareParams = ShareFileParams | ShareFolderParams;
type OperationResult = { success: true } | { success: false; error: string };

/**
 * Ported from apps/web's src/features/documents/services/{commands,queries}/
 * {share-resource-command,revoke-share-command,
 * get-resource-permissions-query}.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * `sendNotificationToUser(...)` (fire-and-forget SSE push layer) replaced
 * with the injected `NotificationsService.create()` (DB-write only, same
 * exclusion as the `notifications`/`projects` slices — no real-time push).
 */
@Injectable()
export class DocumentPermissionsService {
  private readonly logger = new Logger(DocumentPermissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async shareResource(params: ShareParams): Promise<OperationResult> {
    const {
      resourceType,
      granteeType,
      granteeId,
      permission,
      grantedBy,
      organizationId,
    } = params;

    if (granteeType === 'user') {
      const member = await this.prisma.client.member.findFirst({
        where: { userId: granteeId, organizationId },
      });
      if (!member) {
        return {
          success: false,
          error: 'User is not a member of this organization',
        };
      }
    } else {
      const team = await this.prisma.client.team.findFirst({
        where: { id: granteeId, organizationId },
      });
      if (!team) {
        return { success: false, error: 'Team not found in this organization' };
      }
    }

    let resourceName: string | undefined;
    if (resourceType === 'file') {
      const file = await this.prisma.client.userFile.findFirst({
        where: { id: params.fileId, organizationId },
      });
      if (!file) {
        return { success: false, error: 'File not found' };
      }
      resourceName = file.fileName;
    } else {
      const folder = await this.prisma.client.documentFolder.findFirst({
        where: { id: params.folderId, organizationId },
      });
      if (!folder) {
        return { success: false, error: 'Folder not found' };
      }
      resourceName = folder.name;
    }

    const data = {
      resourceType,
      fileId: resourceType === 'file' ? params.fileId : null,
      folderId: resourceType === 'folder' ? params.folderId : null,
      granteeType,
      granteeId,
      permission,
      grantedBy,
    };

    if (resourceType === 'file') {
      await this.prisma.client.documentPermission.upsert({
        where: {
          resourceType_fileId_granteeType_granteeId: {
            resourceType,
            fileId: params.fileId,
            granteeType,
            granteeId,
          },
        },
        create: data,
        update: { permission },
      });
    } else {
      await this.prisma.client.documentPermission.upsert({
        where: {
          resourceType_folderId_granteeType_granteeId: {
            resourceType,
            folderId: params.folderId,
            granteeType,
            granteeId,
          },
        },
        create: data,
        update: { permission },
      });
    }

    if (granteeType === 'user') {
      const resourceUrl =
        resourceType === 'file'
          ? `/knowledge/documents-list?fileId=${params.fileId}`
          : `/knowledge/documents-list`;

      this.notifications
        .create({
          userId: granteeId,
          organizationId,
          type: 'DOCUMENT_SHARED',
          title: 'Udostępniono Ci dokument',
          body: resourceName,
          resourceUrl,
        })
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to send DOCUMENT_SHARED notification (granteeId=${granteeId}, organizationId=${organizationId})`,
            err,
          );
        });
    }

    return { success: true };
  }

  async revokeShare(
    permissionId: number,
    organizationId: string,
  ): Promise<OperationResult> {
    const permission = await this.prisma.client.documentPermission.findUnique({
      where: { id: permissionId },
      include: {
        file: { select: { organizationId: true } },
        folder: { select: { organizationId: true } },
      },
    });

    if (!permission) {
      return { success: false, error: 'Permission not found' };
    }

    const resourceOrgId =
      permission.file?.organizationId ?? permission.folder?.organizationId;
    if (resourceOrgId !== organizationId) {
      return { success: false, error: 'Permission not found' };
    }

    await this.prisma.client.documentPermission.delete({
      where: { id: permissionId },
    });

    return { success: true };
  }

  async getFilePermissions(
    fileId: string,
    organizationId: string,
  ): Promise<DocumentPermissionItem[]> {
    const file = await this.prisma.client.userFile.findFirst({
      where: { id: fileId, organizationId },
      select: { id: true },
    });
    if (!file) {
      return [];
    }

    const permissions = await this.prisma.client.documentPermission.findMany({
      where: { resourceType: 'file', fileId },
      orderBy: { createdAt: 'asc' },
    });

    return this.resolveGranteeNames(permissions);
  }

  async getFolderPermissions(
    folderId: string,
    organizationId: string,
  ): Promise<DocumentPermissionItem[]> {
    const folder = await this.prisma.client.documentFolder.findFirst({
      where: { id: folderId, organizationId },
      select: { id: true },
    });
    if (!folder) {
      return [];
    }

    const permissions = await this.prisma.client.documentPermission.findMany({
      where: { resourceType: 'folder', folderId },
      orderBy: { createdAt: 'asc' },
    });

    return this.resolveGranteeNames(permissions);
  }

  private async resolveGranteeNames(
    permissions: {
      id: number;
      resourceType: string;
      granteeType: string;
      granteeId: string;
      permission: string;
    }[],
  ): Promise<DocumentPermissionItem[]> {
    if (permissions.length === 0) {
      return [];
    }

    const userIds = permissions
      .filter((p) => p.granteeType === 'user')
      .map((p) => p.granteeId);
    const teamIds = permissions
      .filter((p) => p.granteeType === 'team')
      .map((p) => p.granteeId);

    const [users, teams] = await Promise.all([
      userIds.length > 0
        ? this.prisma.client.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve<{ id: string; name: string; email: string }[]>([]),
      teamIds.length > 0
        ? this.prisma.client.team.findMany({
            where: { id: { in: teamIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve<{ id: string; name: string }[]>([]),
    ]);

    const userMap = new Map(users.map((u): [string, typeof u] => [u.id, u]));
    const teamMap = new Map(teams.map((t): [string, typeof t] => [t.id, t]));

    return permissions.map((p) => {
      const isUser = p.granteeType === 'user';
      const user = isUser ? userMap.get(p.granteeId) : undefined;
      const team = !isUser ? teamMap.get(p.granteeId) : undefined;

      return {
        id: String(p.id),
        resourceType: p.resourceType as ResourceType,
        granteeType: p.granteeType as GranteeType,
        granteeId: p.granteeId,
        granteeName: user?.name ?? team?.name ?? 'Unknown',
        granteeEmail: user?.email,
        permission: p.permission as PermissionLevel,
      };
    });
  }
}
