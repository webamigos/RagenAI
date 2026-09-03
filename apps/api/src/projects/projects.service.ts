import crypto from 'node:crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Source, type Project } from '../generated/prisma/client.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { GetProjectMcpProvidersService } from './get-project-mcp-providers.service.js';
import {
  type AccessLevel,
  type EffectiveProjectPermission,
  type ProjectGranteeType,
  type ProjectPermissionItem,
  type ProjectPermissionLevel,
  type PublicProjectDto,
} from './types.js';

const MAX_TITLE_LENGTH = 120;

type SimpleOperationResult =
  { success: true } | { success: false; error: string };

/**
 * Ported from apps/web's src/features/projects/services/{commands,
 * queries}/*.ts + services/utils/require-project-access.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Auth-gate adaptation (the important one): the original
 * `requireProjectAccess(projectId, level)` derived `orgId`/`userId`
 * internally from the Better Auth session (`getOrgIdFromAuthOrThrow()`/
 * `getCurrentUserId()`, both Next.js-specific). Here `requireAccess()`
 * takes `orgId`/`userId` as explicit parameters instead — every caller in
 * apps/api already has them from its own params (resolved upstream from
 * `ApiContext`/the session-auth bridge), same pattern as every other
 * ported service.
 *
 * `getEffectiveProjectPermission()` similarly no longer calls the
 * original's `getActiveMember(organizationId)` (which re-derived the
 * *session's* userId internally via `getSession()`, then looked up that
 * user's `Member` row) — since `userId` is already an explicit parameter
 * here, it's a direct `member.findFirst({organizationId, userId})`
 * lookup instead. `isOrgAdmin(role)` is inlined (`role === 'admin' ||
 * role === 'owner'`) rather than importing apps/web's
 * `src/lib/auth-access-control.ts`.
 *
 * `UnauthorizedException`/`NotFoundException` are `@nestjs/common`'s
 * built-ins, not apps/web's small custom `src/libs/utils/errors.ts` —
 * semantically identical, and what the rest of apps/api already uses
 * (e.g. `ApiKeyGuard`).
 */
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly getProjectMcpProvidersService: GetProjectMcpProvidersService,
  ) {}

  // --- Access control -------------------------------------------------

  async getEffectiveProjectPermission(
    projectId: string,
    organizationId: string,
    userId: string,
  ): Promise<EffectiveProjectPermission> {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, ownerId: true },
    });
    if (!project) {
      return {
        canView: false,
        canManage: false,
        canShare: false,
        canDelete: false,
        source: 'none',
      };
    }

    if (project.ownerId === userId) {
      return {
        canView: true,
        canManage: true,
        canShare: true,
        canDelete: true,
        source: 'owner',
      };
    }

    const member = await this.prisma.client.member
      .findFirst({ where: { organizationId, userId } })
      .catch(() => null);
    if (member && (member.role === 'admin' || member.role === 'owner')) {
      return {
        canView: true,
        canManage: true,
        canShare: true,
        canDelete: true,
        source: 'orgAdmin',
      };
    }

    // Legacy projects without an owner are visible to all org members
    if (project.ownerId === null) {
      return {
        canView: true,
        canManage: false,
        canShare: false,
        canDelete: false,
        source: 'none',
      };
    }

    const teamIds = (
      await this.prisma.client.teamMember.findMany({
        where: { userId, team: { organizationId } },
        select: { teamId: true },
      })
    ).map((t) => t.teamId);

    const grants = await this.prisma.client.projectPermission.findMany({
      where: {
        projectId,
        OR: [
          { granteeType: 'user', granteeId: userId },
          ...(teamIds.length > 0
            ? [{ granteeType: 'team', granteeId: { in: teamIds } }]
            : []),
        ],
      },
      select: { permission: true, granteeType: true },
    });

    if (grants.length === 0) {
      return {
        canView: false,
        canManage: false,
        canShare: false,
        canDelete: false,
        source: 'none',
      };
    }

    const hasFull = grants.some(
      (g) => (g.permission as ProjectPermissionLevel) === 'full',
    );
    const directShare = grants.some((g) => g.granteeType === 'user');

    return {
      canView: true,
      canManage: hasFull,
      canShare: false,
      canDelete: false,
      source: directShare ? 'directShare' : 'teamShare',
    };
  }

  private async requireAccess(
    projectId: string,
    level: AccessLevel,
    orgId: string,
    userId: string,
  ): Promise<void> {
    const perm = await this.getEffectiveProjectPermission(
      projectId,
      orgId,
      userId,
    );

    if (!perm.canView) {
      throw new NotFoundException('Project not found');
    }

    if (level === 'manage' && !perm.canManage) {
      throw new UnauthorizedException(
        'You do not have permission to edit this project',
      );
    }

    if (
      level === 'owner' &&
      perm.source !== 'owner' &&
      perm.source !== 'orgAdmin'
    ) {
      throw new UnauthorizedException(
        'Only the project owner can perform this action',
      );
    }
  }

  // --- Queries ----------------------------------------------------------

  /**
   * Access-gated variant of `getProjectByIdOrThrow`, added for
   * `ProjectsController` (see docs/adrs/21-monorepo-and-api-decoupling.md).
   * `getProjectById`/`getProjectByIdOrThrow` below intentionally don't
   * check org/permission — apps/web's original callers are Server
   * Components that already gated access earlier in the render tree, but
   * an HTTP controller has no equivalent upstream gate, so this checks
   * `getEffectiveProjectPermission().canView` first (the same check
   * `requireAccess()` uses internally for every mutation in this file).
   */
  async getProjectDetail(
    projectId: string,
    orgId: string,
    userId: string,
  ): ReturnType<ProjectsService['getProjectByIdOrThrow']> {
    const perm = await this.getEffectiveProjectPermission(
      projectId,
      orgId,
      userId,
    );
    if (!perm.canView) {
      throw new NotFoundException('Project not found');
    }
    return this.getProjectByIdOrThrow(projectId);
  }

  async getProjectById(id: Project['id']) {
    try {
      return await this.getProjectByIdOrThrow(id);
    } catch (error) {
      this.logger.error('Error fetching project by ID', error);
      throw error;
    }
  }

  async getProjectByIdOrThrow(id: Project['id']) {
    return this.prisma.client.project.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        title: true,
        threads: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            createdAt: true,
            isStarred: true,
          },
        },
        organizationId: true,
        isPublic: true,
        accessToken: true,
        publishedAt: true,
        chatbotEnabled: true,
        ownerId: true,
      },
    });
  }

  async getPublicProject(
    publicAccessTokenId: string,
  ): Promise<PublicProjectDto | null> {
    try {
      const project = await this.prisma.client.project.findFirst({
        where: { accessToken: publicAccessTokenId, isPublic: true },
        select: { organizationId: true, id: true, title: true },
      });

      if (!project || !project.organizationId) {
        return null;
      }

      // Same gate as the embedded widget: an organization with publicChatbot
      // off serves neither external chatbot surface. `null` reads to the
      // caller as "no such published project", which is what an anonymous
      // visitor holding a stale access token should learn.
      const enabled = await this.subscriptions.isFeatureEnabled(
        project.organizationId,
        'publicChatbot',
      );
      if (!enabled) {
        return null;
      }

      return {
        organizationId: project.organizationId,
        projectId: project.id,
        title: project.title,
      };
    } catch (error) {
      this.logger.error('Error fetching public project', error);
      throw error;
    }
  }

  async getUserProjects(
    organizationId: string,
    userId: string,
    options: { includeArchived?: boolean } = {},
  ) {
    const { includeArchived = false } = options;
    try {
      const teamIds = (
        await this.prisma.client.teamMember.findMany({
          where: { userId, team: { organizationId } },
          select: { teamId: true },
        })
      ).map((t) => t.teamId);

      const sharedProjectIds = (
        await this.prisma.client.projectPermission.findMany({
          where: {
            project: { organizationId },
            OR: [
              { granteeType: 'user', granteeId: userId },
              ...(teamIds.length > 0
                ? [{ granteeType: 'team', granteeId: { in: teamIds } }]
                : []),
            ],
          },
          select: { projectId: true },
        })
      ).map((p) => p.projectId);

      const projects = await this.prisma.client.project.findMany({
        where: {
          organizationId,
          ...(includeArchived ? {} : { isArchived: false }),
          OR: [
            { ownerId: userId },
            ...(sharedProjectIds.length > 0
              ? [{ id: { in: sharedProjectIds } }]
              : []),
          ],
        },
        orderBy: [{ isStarred: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          title: true,
          createdAt: true,
          organizationId: true,
          ownerId: true,
          isStarred: true,
          isArchived: true,
          threads: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              createdAt: true,
              visitorId: true,
              preferredCommunicationType: true,
              projectId: true,
              messages: {
                orderBy: { createdAt: 'asc' },
                select: { content: true },
              },
            },
          },
        },
      });

      // Visitor-scoped threads: each user only sees threads they created.
      return projects.map((project) => ({
        ...project,
        isOwned: project.ownerId === userId,
        isShared: project.ownerId !== userId,
        createdAt: project.createdAt.toISOString(),
        threads: project.threads
          .filter(
            (thread) =>
              project.ownerId === userId || thread.visitorId === userId,
          )
          .map((thread) => ({
            ...thread,
            createdAt: thread.createdAt.toISOString(),
          })),
      }));
    } catch (error) {
      this.logger.error('Error fetching projects for user', error);
      throw error;
    }
  }

  async getDefaultProjectId(organizationId: string): Promise<string | null> {
    const result = await this.prisma.client.project.findFirst({
      where: { organizationId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return result?.id ?? null;
  }

  /**
   * Delegates to the already-ported `GetProjectMcpProvidersService`
   * (from the MCP tool-loading slice, still needed there by
   * `LoadMcpToolsService`) rather than re-implementing the same query —
   * single source of truth within this module.
   */
  async getProjectMcpProviders(
    projectId: string,
    organizationId?: string,
  ): Promise<string[]> {
    return this.getProjectMcpProvidersService.getProjectMcpProviders(
      projectId,
      organizationId,
    );
  }

  async getProjectPermissions(
    projectId: string,
    organizationId: string,
  ): Promise<ProjectPermissionItem[]> {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) {
      return [];
    }

    const permissions = await this.prisma.client.projectPermission.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    if (permissions.length === 0) {
      return [];
    }

    const userIds = permissions
      .filter((p) => p.granteeType === 'user')
      .map((p) => p.granteeId);
    const teamIds = permissions
      .filter((p) => p.granteeType === 'team')
      .map((p) => p.granteeId);

    const [users, teams]: [
      { id: string; name: string | null; email: string }[],
      { id: string; name: string }[],
    ] = await Promise.all([
      userIds.length > 0
        ? this.prisma.client.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [],
      teamIds.length > 0
        ? this.prisma.client.team.findMany({
            where: { id: { in: teamIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const teamMap = new Map(teams.map((t) => [t.id, t]));

    return permissions.map((p) => {
      const isUser = p.granteeType === 'user';
      const user = isUser ? userMap.get(p.granteeId) : undefined;
      const team = !isUser ? teamMap.get(p.granteeId) : undefined;
      return {
        id: String(p.id),
        granteeType: p.granteeType as ProjectGranteeType,
        granteeId: p.granteeId,
        granteeName: user?.name ?? team?.name ?? 'Unknown',
        granteeEmail: user?.email,
        permission: p.permission as ProjectPermissionLevel,
      };
    });
  }

  async getProjectInstruction(
    projectId: string,
    orgId: string,
  ): Promise<string | null> {
    if (!projectId) {
      return null;
    }

    const project = await this.prisma.client.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.organizationId !== orgId) {
      this.logger.error(
        `Unauthorized: project ${projectId} does not belong to org ${orgId}`,
      );
      throw new NotFoundException('Project not found');
    }

    const settings = await this.prisma.client.projectSettings.findUnique({
      where: { projectId: project.id },
      select: { instructions: true },
    });

    return settings?.instructions ?? null;
  }

  // --- Commands -----------------------------------------------------------

  async createProject(title: string, organizationId: string, userId: string) {
    try {
      const project = await this.prisma.client.project.create({
        data: {
          title,
          organizationId,
          ownerId: userId,
          source: Source.UI,
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          organizationId: true,
          threads: true,
          ownerId: true,
          isPublic: true,
          accessToken: true,
          publishedAt: true,
          chatbotEnabled: true,
          isStarred: true,
          isArchived: true,
          archivedAt: true,
          source: true,
          templateId: true,
        },
      });

      this.auditLog.track({
        orgId: organizationId,
        userId,
        action: 'project.created',
        entityType: 'project',
        entityId: project.id,
        newData: { title },
      });

      return project;
    } catch (error) {
      this.logger.error('Error creating project in database', error);
      throw error;
    }
  }

  async archiveProject(
    projectId: string,
    archived: boolean,
    orgId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    try {
      await this.requireAccess(projectId, 'manage', orgId, userId);

      await this.prisma.client.project.update({
        where: { id: projectId },
        data: {
          isArchived: archived,
          archivedAt: archived ? new Date() : null,
        },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error archiving project ${projectId} (archived=${archived})`,
        error,
      );
      throw error;
    }
  }

  /**
   * Hard-deletes a project and DB-side related rows.
   *
   * Note: S3 blobs and Qdrant vectors for the project's files are NOT
   * cleaned up here — that's intentional follow-up work (matches the
   * original). Orphaned blobs/vectors are harmless because the
   * references in Postgres are gone after this call.
   */
  async deleteProject(
    projectId: string,
    orgId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    try {
      await this.requireAccess(projectId, 'owner', orgId, userId);

      await this.prisma.client.$transaction(async (tx) => {
        await tx.aiUsage.updateMany({
          where: { projectId },
          data: { projectId: null },
        });

        await tx.thread.deleteMany({ where: { projectId } });
        await tx.userDocument.deleteMany({ where: { projectId } });
        await tx.userFile.deleteMany({ where: { projectId } });

        await tx.project.delete({ where: { id: projectId } });
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Error deleting project ${projectId}`, error);
      throw error;
    }
  }

  async disablePublicAccess(
    projectId: string,
    orgId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    try {
      await this.requireAccess(projectId, 'owner', orgId, userId);

      const project = await this.prisma.client.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      await this.prisma.client.project.update({
        where: { id: project.id },
        data: { isPublic: false, accessToken: null, publishedAt: null },
      });

      this.logger.log(`Public access disabled for project ${projectId}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Error disabling public access', error);
      throw error;
    }
  }

  async markIntegrationsPrompted(
    projectId: string,
    orgId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    try {
      await this.requireAccess(projectId, 'manage', orgId, userId);

      const now = new Date();
      await this.prisma.client.projectSettings.upsert({
        where: { projectId },
        update: { integrationsPromptedAt: now },
        create: { projectId, integrationsPromptedAt: now },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error marking integrations prompted for project ${projectId}`,
        error,
      );
      throw error;
    }
  }

  async renameProject(
    projectId: string,
    title: string,
    orgId: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const trimmed = title.trim();
    if (!trimmed) {
      return { success: false, error: 'Title is required' };
    }
    if (trimmed.length > MAX_TITLE_LENGTH) {
      return { success: false, error: 'Title is too long' };
    }

    try {
      await this.requireAccess(projectId, 'manage', orgId, userId);

      await this.prisma.client.project.update({
        where: { id: projectId },
        data: { title: trimmed },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Error renaming project ${projectId}`, error);
      throw error;
    }
  }

  async saveProjectInstruction(
    projectId: string,
    instruction: string,
    orgId: string,
    userId: string,
  ): Promise<void> {
    if (!projectId) {
      throw new NotFoundException('Project ID is required');
    }

    await this.requireAccess(projectId, 'manage', orgId, userId);

    await this.prisma.client.projectSettings.upsert({
      where: { projectId },
      update: { instructions: instruction },
      create: { projectId, instructions: instruction },
    });
  }

  async saveProjectMcpProviders(
    projectId: string,
    enabledMcpProviders: string[],
    orgId: string,
    userId: string,
  ): Promise<void> {
    await this.requireAccess(projectId, 'manage', orgId, userId);

    await this.prisma.client.projectSettings.upsert({
      where: { projectId },
      update: { enabledMcpProviders },
      create: { projectId, enabledMcpProviders },
    });
  }

  async starProject(
    projectId: string,
    starred: boolean,
    orgId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    try {
      await this.requireAccess(projectId, 'manage', orgId, userId);

      await this.prisma.client.project.update({
        where: { id: projectId },
        data: { isStarred: starred },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error starring project ${projectId} (starred=${starred})`,
        error,
      );
      throw error;
    }
  }

  async revokeProjectShare(
    permissionId: number,
    organizationId: string,
  ): Promise<SimpleOperationResult> {
    const permission = await this.prisma.client.projectPermission.findUnique({
      where: { id: permissionId },
      include: { project: { select: { organizationId: true } } },
    });

    if (!permission || permission.project.organizationId !== organizationId) {
      return { success: false, error: 'Permission not found' };
    }

    await this.prisma.client.projectPermission.delete({
      where: { id: permissionId },
    });

    return { success: true };
  }

  async shareProject(params: {
    projectId: string;
    organizationId: string;
    granteeType: ProjectGranteeType;
    granteeId: string;
    permission: ProjectPermissionLevel;
    grantedBy: string;
  }): Promise<SimpleOperationResult> {
    const {
      projectId,
      organizationId,
      granteeType,
      granteeId,
      permission,
      grantedBy,
    } = params;

    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, title: true, ownerId: true },
    });
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    if (granteeType === 'user') {
      if (granteeId === project.ownerId) {
        return { success: false, error: 'Owner already has full access' };
      }
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
        return {
          success: false,
          error: 'Team not found in this organization',
        };
      }
    }

    await this.prisma.client.projectPermission.upsert({
      where: {
        projectId_granteeType_granteeId: {
          projectId,
          granteeType,
          granteeId,
        },
      },
      create: { projectId, granteeType, granteeId, permission, grantedBy },
      update: { permission },
    });

    if (granteeType === 'user') {
      this.notifications
        .create({
          userId: granteeId,
          organizationId,
          type: 'PROJECT_SHARED',
          title: 'Udostępniono Ci projekt',
          body: project.title,
          resourceUrl: `/projects/${projectId}`,
        })
        .catch((err: unknown) => {
          this.logger.error(
            `sendNotificationToUser (project share) failed for project ${projectId}`,
            err,
          );
        });
    }

    return { success: true };
  }

  async generateProjectKey(
    projectId: string,
    orgId: string,
    userId: string,
  ): Promise<{ accessToken: string | null }> {
    let existing: { id: string } | null;

    // Access and existence keep their original error handling: both collapse
    // into the generic 'Failed to generate access token' this method has
    // always thrown.
    try {
      await this.requireAccess(projectId, 'owner', orgId, userId);

      existing = await this.prisma.client.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });

      if (!existing) {
        throw new Error('Project not found');
      }
    } catch (error) {
      this.logger.error('Error generating access token', error);
      throw new Error('Failed to generate access token');
    }

    // This is the mint side of the hosted public assistant page — it sets
    // isPublic and hands back a shareable token, so it needs the same gate
    // toggleChatbot has for the embedded widget.
    //
    // Thrown outside the try on purpose: the caller shows an upgrade prompt
    // for this, which the generic message above would hide. Deliberately not
    // done by rethrowing from that catch — that would also change how the
    // owner-access failure surfaces, which is not this change's business.
    const canPublish = await this.subscriptions.isFeatureEnabled(
      orgId,
      'publicChatbot',
    );
    if (!canPublish) {
      throw new UnauthorizedException(
        'Public chatbot is not enabled for your organization plan',
      );
    }

    try {
      this.logger.log('Generating access token for project');

      const project = await this.prisma.client.project.update({
        where: { id: existing.id },
        data: {
          accessToken: crypto.randomUUID(),
          isPublic: true,
          publishedAt: new Date(),
        },
        select: { accessToken: true },
      });

      this.auditLog.track({
        orgId,
        userId,
        action: 'project.key_generated',
        entityType: 'project',
        entityId: projectId,
      });

      return { accessToken: project.accessToken };
    } catch (error) {
      this.logger.error('Error generating access token', error);
      throw new Error('Failed to generate access token');
    }
  }

  async toggleChatbot(
    projectId: string,
    enabled: boolean,
    orgId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    try {
      await this.requireAccess(projectId, 'owner', orgId, userId);

      if (enabled) {
        const canChatbot = await this.subscriptions.isFeatureEnabled(
          orgId,
          'publicChatbot',
        );
        if (!canChatbot) {
          throw new UnauthorizedException(
            'Public chatbot is not enabled for your organization plan',
          );
        }
      }

      await this.prisma.client.project.update({
        where: { id: projectId },
        data: { chatbotEnabled: enabled },
      });

      this.logger.log(
        `Chatbot status updated for project ${projectId} (enabled=${enabled})`,
      );
      return { success: true };
    } catch (error) {
      // Surface authorization failures so the caller can show the upgrade
      // prompt instead of a generic "couldn't save" state.
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(
        `Error updating chatbot status for ${projectId}`,
        error,
      );
      return { success: false };
    }
  }
}
