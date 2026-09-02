/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type AuditLogService } from '../audit-logs/audit-log.service.js';
import { type NotificationsService } from '../notifications/notifications.service.js';
import { type SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { type GetProjectMcpProvidersService } from './get-project-mcp-providers.service.js';

describe('ProjectsService', () => {
  function makeService(
    overrides: {
      project?: Partial<Record<string, jest.Mock>>;
      member?: Partial<Record<string, jest.Mock>>;
      teamMember?: Partial<Record<string, jest.Mock>>;
      projectPermission?: Partial<Record<string, jest.Mock>>;
      projectSettings?: Partial<Record<string, jest.Mock>>;
      user?: Partial<Record<string, jest.Mock>>;
      team?: Partial<Record<string, jest.Mock>>;
      auditLog?: jest.Mock;
      notificationsCreate?: jest.Mock;
      isFeatureEnabled?: jest.Mock;
    } = {},
  ) {
    const projectOps = {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      ...overrides.project,
    };
    const memberOps = {
      findFirst: jest.fn().mockResolvedValue(null),
      ...overrides.member,
    };
    const teamMemberOps = {
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.teamMember,
    };
    const projectPermissionOps = {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ id: 1 }),
      delete: jest.fn().mockResolvedValue({}),
      ...overrides.projectPermission,
    };
    const projectSettingsOps = {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      ...overrides.projectSettings,
    };
    const userOps = {
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.user,
    };
    const teamOps = {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.team,
    };
    const $transaction = jest.fn((cb: (tx: unknown) => unknown) => {
      const tx = {
        aiUsage: { updateMany: jest.fn().mockResolvedValue({}) },
        thread: { deleteMany: jest.fn().mockResolvedValue({}) },
        userDocument: { deleteMany: jest.fn().mockResolvedValue({}) },
        userFile: { deleteMany: jest.fn().mockResolvedValue({}) },
        project: { delete: jest.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    });

    const prisma = {
      client: {
        project: projectOps,
        member: memberOps,
        teamMember: teamMemberOps,
        projectPermission: projectPermissionOps,
        projectSettings: projectSettingsOps,
        user: userOps,
        team: teamOps,
        $transaction,
      },
    } as unknown as PrismaService;

    const auditLog = {
      track: overrides.auditLog ?? jest.fn(),
    } as unknown as AuditLogService;

    const notifications = {
      create: overrides.notificationsCreate ?? jest.fn().mockResolvedValue({}),
    } as unknown as NotificationsService;

    const subscriptions = {
      isFeatureEnabled:
        overrides.isFeatureEnabled ?? jest.fn().mockResolvedValue(true),
    } as unknown as SubscriptionsService;

    const getProjectMcpProvidersService = {
      getProjectMcpProviders: jest.fn().mockResolvedValue([]),
    } as unknown as GetProjectMcpProvidersService;

    const service = new ProjectsService(
      prisma,
      auditLog,
      notifications,
      subscriptions,
      getProjectMcpProvidersService,
    );

    return {
      service,
      projectOps,
      memberOps,
      teamMemberOps,
      projectPermissionOps,
      projectSettingsOps,
      userOps,
      teamOps,
      auditLog,
      notifications,
      subscriptions,
      getProjectMcpProvidersService,
    };
  }

  const ORG = 'org-1';
  const PROJECT = 'proj-1';

  describe('getEffectiveProjectPermission', () => {
    it('returns no access when project missing', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue(null);

      const res = await service.getEffectiveProjectPermission(
        PROJECT,
        ORG,
        'u',
      );
      expect(res.canView).toBe(false);
      expect(res.source).toBe('none');
    });

    it('owner gets full management + share + delete', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      const res = await service.getEffectiveProjectPermission(
        PROJECT,
        ORG,
        'u',
      );
      expect(res).toEqual({
        canView: true,
        canManage: true,
        canShare: true,
        canDelete: true,
        source: 'owner',
      });
    });

    it('org admin can manage and share even without ownership', async () => {
      const { service, projectOps, memberOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
      memberOps.findFirst.mockResolvedValue({ role: 'admin' });

      const res = await service.getEffectiveProjectPermission(
        PROJECT,
        ORG,
        'u',
      );
      expect(res.canShare).toBe(true);
      expect(res.source).toBe('orgAdmin');
    });

    it('looks up membership for the given userId, not a session-derived one', async () => {
      const { service, projectOps, memberOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
      memberOps.findFirst.mockResolvedValue({ role: 'owner' });

      await service.getEffectiveProjectPermission(PROJECT, ORG, 'u-42');

      expect(memberOps.findFirst).toHaveBeenCalledWith({
        where: { organizationId: ORG, userId: 'u-42' },
      });
    });

    it('legacy ownerless project is view-only for org members', async () => {
      const { service, projectOps, memberOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: null });
      memberOps.findFirst.mockResolvedValue({ role: 'member' });

      const res = await service.getEffectiveProjectPermission(
        PROJECT,
        ORG,
        'u',
      );
      expect(res.canView).toBe(true);
      expect(res.canManage).toBe(false);
      expect(res.canShare).toBe(false);
    });

    it('direct view share grants view but not manage', async () => {
      const { service, projectOps, projectPermissionOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
      projectPermissionOps.findMany.mockResolvedValue([
        { permission: 'view', granteeType: 'user' },
      ]);

      const res = await service.getEffectiveProjectPermission(
        PROJECT,
        ORG,
        'u',
      );
      expect(res.canView).toBe(true);
      expect(res.canManage).toBe(false);
      expect(res.canShare).toBe(false);
      expect(res.source).toBe('directShare');
    });

    it('full share grants manage but not share/delete', async () => {
      const { service, projectOps, projectPermissionOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
      projectPermissionOps.findMany.mockResolvedValue([
        { permission: 'full', granteeType: 'user' },
      ]);

      const res = await service.getEffectiveProjectPermission(
        PROJECT,
        ORG,
        'u',
      );
      expect(res.canManage).toBe(true);
      expect(res.canShare).toBe(false);
      expect(res.canDelete).toBe(false);
    });

    it('team share is resolved via team membership', async () => {
      const { service, projectOps, teamMemberOps, projectPermissionOps } =
        makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
      teamMemberOps.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
      projectPermissionOps.findMany.mockResolvedValue([
        { permission: 'view', granteeType: 'team' },
      ]);

      const res = await service.getEffectiveProjectPermission(
        PROJECT,
        ORG,
        'u',
      );
      expect(res.canView).toBe(true);
      expect(res.source).toBe('teamShare');
    });

    it('returns no access when user has neither ownership nor a grant', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });

      const res = await service.getEffectiveProjectPermission(
        PROJECT,
        ORG,
        'u',
      );
      expect(res.canView).toBe(false);
      expect(res.source).toBe('none');
    });
  });

  describe('requireAccess (via archiveProject)', () => {
    it('throws NotFoundException when the caller cannot view the project', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue(null);

      await expect(
        service.archiveProject(PROJECT, true, ORG, 'u'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when the caller can view but not manage', async () => {
      const { service, projectOps, projectPermissionOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
      projectPermissionOps.findMany.mockResolvedValue([
        { permission: 'view', granteeType: 'user' },
      ]);

      await expect(
        service.archiveProject(PROJECT, true, ORG, 'u'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('allows the owner to archive', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      const result = await service.archiveProject(PROJECT, true, ORG, 'u');
      expect(result).toEqual({ success: true });
    });
  });

  describe('archiveProject', () => {
    it('archives and stamps archivedAt', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      const result = await service.archiveProject(PROJECT, true, ORG, 'u');

      expect(result).toEqual({ success: true });
      const call = projectOps.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: PROJECT });
      expect(call.data.isArchived).toBe(true);
      expect(call.data.archivedAt).toBeInstanceOf(Date);
    });

    it('unarchives and clears archivedAt', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      await service.archiveProject(PROJECT, false, ORG, 'u');

      expect(projectOps.update).toHaveBeenCalledWith({
        where: { id: PROJECT },
        data: { isArchived: false, archivedAt: null },
      });
    });
  });

  describe('renameProject', () => {
    it('rejects an empty title without checking access', async () => {
      const { service, projectOps } = makeService();
      const result = await service.renameProject(PROJECT, '   ', ORG, 'u');
      expect(result).toEqual({ success: false, error: 'Title is required' });
      expect(projectOps.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a too-long title', async () => {
      const { service } = makeService();
      const result = await service.renameProject(
        PROJECT,
        'x'.repeat(121),
        ORG,
        'u',
      );
      expect(result).toEqual({ success: false, error: 'Title is too long' });
    });

    it('renames when access allows', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      const result = await service.renameProject(
        PROJECT,
        '  New title  ',
        ORG,
        'u',
      );
      expect(result).toEqual({ success: true });
      expect(projectOps.update).toHaveBeenCalledWith({
        where: { id: PROJECT },
        data: { title: 'New title' },
      });
    });
  });

  describe('starProject', () => {
    it('stars the project', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      const result = await service.starProject(PROJECT, true, ORG, 'u');
      expect(result).toEqual({ success: true });
      expect(projectOps.update).toHaveBeenCalledWith({
        where: { id: PROJECT },
        data: { isStarred: true },
      });
    });
  });

  describe('deleteProject', () => {
    it('requires owner-level access', async () => {
      const { service, projectOps, projectPermissionOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
      projectPermissionOps.findMany.mockResolvedValue([
        { permission: 'full', granteeType: 'user' },
      ]);

      await expect(service.deleteProject(PROJECT, ORG, 'u')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deletes the project and related rows in a transaction when owner', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      const result = await service.deleteProject(PROJECT, ORG, 'u');
      expect(result).toEqual({ success: true });
    });
  });

  describe('disablePublicAccess', () => {
    it('clears public-access fields', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });
      projectOps.findUnique.mockResolvedValue({ id: PROJECT });

      const result = await service.disablePublicAccess(PROJECT, ORG, 'u');
      expect(result).toEqual({ success: true });
      expect(projectOps.update).toHaveBeenCalledWith({
        where: { id: PROJECT },
        data: { isPublic: false, accessToken: null, publishedAt: null },
      });
    });
  });

  describe('markIntegrationsPrompted', () => {
    it('upserts integrationsPromptedAt', async () => {
      const { service, projectOps, projectSettingsOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      const result = await service.markIntegrationsPrompted(PROJECT, ORG, 'u');
      expect(result).toEqual({ success: true });
      expect(projectSettingsOps.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: PROJECT } }),
      );
    });
  });

  describe('saveProjectInstruction / saveProjectMcpProviders', () => {
    it('throws when projectId is missing', async () => {
      const { service } = makeService();
      await expect(
        service.saveProjectInstruction('', 'x', ORG, 'u'),
      ).rejects.toThrow(NotFoundException);
    });

    it('upserts the instruction when access allows', async () => {
      const { service, projectOps, projectSettingsOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      await service.saveProjectInstruction(PROJECT, 'Be nice', ORG, 'u');
      expect(projectSettingsOps.upsert).toHaveBeenCalledWith({
        where: { projectId: PROJECT },
        update: { instructions: 'Be nice' },
        create: { projectId: PROJECT, instructions: 'Be nice' },
      });
    });

    it('upserts enabled MCP providers when access allows', async () => {
      const { service, projectOps, projectSettingsOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      await service.saveProjectMcpProviders(PROJECT, ['GOOGLE'], ORG, 'u');
      expect(projectSettingsOps.upsert).toHaveBeenCalledWith({
        where: { projectId: PROJECT },
        update: { enabledMcpProviders: ['GOOGLE'] },
        create: { projectId: PROJECT, enabledMcpProviders: ['GOOGLE'] },
      });
    });
  });

  describe('getProjectMcpProviders', () => {
    it('delegates to GetProjectMcpProvidersService', async () => {
      const { service, getProjectMcpProvidersService } = makeService();
      (
        getProjectMcpProvidersService.getProjectMcpProviders as jest.Mock
      ).mockResolvedValue(['SLACK']);

      const result = await service.getProjectMcpProviders(PROJECT, ORG);
      expect(result).toEqual(['SLACK']);
      expect(
        getProjectMcpProvidersService.getProjectMcpProviders,
      ).toHaveBeenCalledWith(PROJECT, ORG);
    });
  });

  describe('revokeProjectShare', () => {
    it('returns error when permission not found', async () => {
      const { service, projectPermissionOps } = makeService();
      projectPermissionOps.findUnique.mockResolvedValue(null);

      const result = await service.revokeProjectShare(1, ORG);
      expect(result).toEqual({ success: false, error: 'Permission not found' });
    });

    it('returns error when permission belongs to a different org', async () => {
      const { service, projectPermissionOps } = makeService();
      projectPermissionOps.findUnique.mockResolvedValue({
        id: 1,
        project: { organizationId: 'other-org' },
      });

      const result = await service.revokeProjectShare(1, ORG);
      expect(result.success).toBe(false);
    });

    it('deletes the permission when it belongs to the org', async () => {
      const { service, projectPermissionOps } = makeService();
      projectPermissionOps.findUnique.mockResolvedValue({
        id: 1,
        project: { organizationId: ORG },
      });

      const result = await service.revokeProjectShare(1, ORG);
      expect(result).toEqual({ success: true });
      expect(projectPermissionOps.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  describe('shareProject', () => {
    const GRANTER_ID = 'granter-1';

    it('returns error when project not found in org', async () => {
      const { service, projectOps, projectPermissionOps } = makeService();
      projectOps.findFirst.mockResolvedValue(null);

      const result = await service.shareProject({
        projectId: PROJECT,
        organizationId: ORG,
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: GRANTER_ID,
      });

      expect(result).toEqual({ success: false, error: 'Project not found' });
      expect(projectPermissionOps.upsert).not.toHaveBeenCalled();
    });

    it('rejects sharing back to the owner', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({
        id: PROJECT,
        title: 'P',
        ownerId: 'owner-1',
      });

      const result = await service.shareProject({
        projectId: PROJECT,
        organizationId: ORG,
        granteeType: 'user',
        granteeId: 'owner-1',
        permission: 'view',
        grantedBy: GRANTER_ID,
      });
      expect(result.success).toBe(false);
    });

    it('rejects user grantee not in organization', async () => {
      const { service, projectOps, memberOps } = makeService();
      projectOps.findFirst.mockResolvedValue({
        id: PROJECT,
        title: 'P',
        ownerId: 'owner-1',
      });
      memberOps.findFirst.mockResolvedValue(null);

      const result = await service.shareProject({
        projectId: PROJECT,
        organizationId: ORG,
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: GRANTER_ID,
      });
      expect(result).toEqual({
        success: false,
        error: 'User is not a member of this organization',
      });
    });

    it('rejects team grantee outside the org', async () => {
      const { service, projectOps, teamOps } = makeService();
      projectOps.findFirst.mockResolvedValue({
        id: PROJECT,
        title: 'P',
        ownerId: 'owner-1',
      });
      teamOps.findFirst.mockResolvedValue(null);

      const result = await service.shareProject({
        projectId: PROJECT,
        organizationId: ORG,
        granteeType: 'team',
        granteeId: 'team-x',
        permission: 'full',
        grantedBy: GRANTER_ID,
      });
      expect(result).toEqual({
        success: false,
        error: 'Team not found in this organization',
      });
    });

    it('upserts permission and notifies user grantee via NotificationsService', async () => {
      const {
        service,
        projectOps,
        memberOps,
        projectPermissionOps,
        notifications,
      } = makeService();
      projectOps.findFirst.mockResolvedValue({
        id: PROJECT,
        title: 'My project',
        ownerId: 'owner-1',
      });
      memberOps.findFirst.mockResolvedValue({ id: 'm-1' });
      projectPermissionOps.upsert.mockResolvedValue({ id: 1 });

      const result = await service.shareProject({
        projectId: PROJECT,
        organizationId: ORG,
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'full',
        grantedBy: GRANTER_ID,
      });

      expect(result).toEqual({ success: true });
      expect(projectPermissionOps.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId_granteeType_granteeId: {
              projectId: PROJECT,
              granteeType: 'user',
              granteeId: 'user-2',
            },
          },
          update: { permission: 'full' },
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          organizationId: ORG,
          type: 'PROJECT_SHARED',
          body: 'My project',
        }),
      );
    });

    it('does not notify when sharing with a team', async () => {
      const {
        service,
        projectOps,
        teamOps,
        projectPermissionOps,
        notifications,
      } = makeService();
      projectOps.findFirst.mockResolvedValue({
        id: PROJECT,
        title: 'P',
        ownerId: 'owner-1',
      });
      teamOps.findFirst.mockResolvedValue({ id: 'team-1' });
      projectPermissionOps.upsert.mockResolvedValue({ id: 2 });

      const result = await service.shareProject({
        projectId: PROJECT,
        organizationId: ORG,
        granteeType: 'team',
        granteeId: 'team-1',
        permission: 'view',
        grantedBy: GRANTER_ID,
      });

      expect(result).toEqual({ success: true });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('does not fail the share when notification creation rejects', async () => {
      const notificationsCreate = jest
        .fn()
        .mockRejectedValue(new Error('boom'));
      const { service, projectOps, memberOps, projectPermissionOps } =
        makeService({ notificationsCreate });
      projectOps.findFirst.mockResolvedValue({
        id: PROJECT,
        title: 'P',
        ownerId: 'owner-1',
      });
      memberOps.findFirst.mockResolvedValue({ id: 'm-1' });
      projectPermissionOps.upsert.mockResolvedValue({ id: 3 });

      const result = await service.shareProject({
        projectId: PROJECT,
        organizationId: ORG,
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'view',
        grantedBy: GRANTER_ID,
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe('createProject', () => {
    it('creates the project and fires an audit-log entry', async () => {
      const { service, projectOps, auditLog } = makeService();
      projectOps.create.mockResolvedValue({ id: PROJECT, title: 'New' });

      const result = await service.createProject('New', ORG, 'u');

      expect(result).toEqual({ id: PROJECT, title: 'New' });
      expect(auditLog.track).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG,
          userId: 'u',
          action: 'project.created',
          entityType: 'project',
          entityId: PROJECT,
        }),
      );
    });
  });

  describe('generateProjectKey', () => {
    it('requires owner-level access', async () => {
      const { service, projectOps, projectPermissionOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
      projectPermissionOps.findMany.mockResolvedValue([
        { permission: 'full', granteeType: 'user' },
      ]);

      await expect(
        service.generateProjectKey(PROJECT, ORG, 'u'),
      ).rejects.toThrow('Failed to generate access token');
    });

    it('generates a token and audit-logs it when owner', async () => {
      const { service, projectOps, auditLog } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });
      projectOps.findUnique.mockResolvedValue({ id: PROJECT });
      projectOps.update.mockResolvedValue({ accessToken: 'token-123' });

      const result = await service.generateProjectKey(PROJECT, ORG, 'u');
      expect(result).toEqual({ accessToken: 'token-123' });
      expect(auditLog.track).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.key_generated',
          entityType: 'project',
          entityId: PROJECT,
        }),
      );
    });
  });

  describe('toggleChatbot', () => {
    it('enables the chatbot when the plan allows it', async () => {
      const { service, projectOps, subscriptions } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      const result = await service.toggleChatbot(PROJECT, true, ORG, 'u');
      expect(result).toEqual({ success: true });
      expect(subscriptions.isFeatureEnabled).toHaveBeenCalledWith(
        ORG,
        'publicChatbot',
      );
    });

    it('throws UnauthorizedException when the plan does not allow the chatbot', async () => {
      const isFeatureEnabled = jest.fn().mockResolvedValue(false);
      const { service, projectOps } = makeService({ isFeatureEnabled });
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      await expect(
        service.toggleChatbot(PROJECT, true, ORG, 'u'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('allows disabling without checking the feature flag', async () => {
      const isFeatureEnabled = jest.fn();
      const { service, projectOps } = makeService({ isFeatureEnabled });
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });

      const result = await service.toggleChatbot(PROJECT, false, ORG, 'u');
      expect(result).toEqual({ success: true });
      expect(isFeatureEnabled).not.toHaveBeenCalled();
    });
  });

  describe('generateProjectKey', () => {
    it('throws UnauthorizedException when publicChatbot is disabled', async () => {
      // The mint side of the hosted public assistant page: it flips isPublic
      // and hands back a shareable token, so it needs the same gate
      // toggleChatbot has for the embedded widget.
      const isFeatureEnabled = jest.fn().mockResolvedValue(false);
      const { service, projectOps } = makeService({ isFeatureEnabled });
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });
      projectOps.findUnique.mockResolvedValue({ id: PROJECT });

      await expect(
        service.generateProjectKey(PROJECT, ORG, 'u'),
      ).rejects.toThrow(UnauthorizedException);
      expect(projectOps.update).not.toHaveBeenCalled();
      expect(isFeatureEnabled).toHaveBeenCalledWith(ORG, 'publicChatbot');
    });
  });

  describe('getPublicProject', () => {
    it('returns null for a published project once publicChatbot is disabled', async () => {
      // Turning the feature off has to stop serving pages already published,
      // not just stop new ones being published. `null` reads to the caller as
      // "no such published project" — an anonymous visitor holding a stale
      // access token learns nothing more.
      const isFeatureEnabled = jest.fn().mockResolvedValue(false);
      const { service, projectOps } = makeService({ isFeatureEnabled });
      projectOps.findFirst.mockResolvedValue({
        id: PROJECT,
        title: 'Public project',
        organizationId: ORG,
      });

      const result = await service.getPublicProject('token-abc');

      expect(result).toBeNull();
      // The org comes from the project, not a session — the caller is anonymous.
      expect(isFeatureEnabled).toHaveBeenCalledWith(ORG, 'publicChatbot');
    });
  });

  describe('getUserProjects', () => {
    it('scopes threads to the owner or the visitor who created them', async () => {
      const { service, projectOps } = makeService();
      projectOps.findMany.mockResolvedValue([
        {
          id: PROJECT,
          title: 'P',
          createdAt: new Date('2026-01-01'),
          organizationId: ORG,
          ownerId: 'owner-1',
          isStarred: false,
          isArchived: false,
          threads: [
            {
              id: 't1',
              createdAt: new Date('2026-01-02'),
              visitorId: 'owner-1',
              preferredCommunicationType: null,
              projectId: PROJECT,
              messages: [],
            },
            {
              id: 't2',
              createdAt: new Date('2026-01-02'),
              visitorId: 'someone-else',
              preferredCommunicationType: null,
              projectId: PROJECT,
              messages: [],
            },
          ],
        },
      ]);

      const result = await service.getUserProjects(ORG, 'other-viewer');
      // Neither thread belongs to "other-viewer" and they don't own the
      // project, so both threads should be filtered out for them.
      expect(result[0].threads).toHaveLength(0);
      expect(result[0].isOwned).toBe(false);
    });
  });

  describe('getProjectInstruction', () => {
    it('returns null for an empty projectId', async () => {
      const { service } = makeService();
      await expect(service.getProjectInstruction('', ORG)).resolves.toBeNull();
    });

    it('throws NotFoundException when the project belongs to a different org', async () => {
      const { service, projectOps } = makeService();
      projectOps.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: 'other-org',
      });

      await expect(service.getProjectInstruction(PROJECT, ORG)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the stored instructions', async () => {
      const { service, projectOps, projectSettingsOps } = makeService();
      projectOps.findUnique.mockResolvedValue({
        id: PROJECT,
        organizationId: ORG,
      });
      projectSettingsOps.findUnique.mockResolvedValue({
        instructions: 'Be concise',
      });

      await expect(service.getProjectInstruction(PROJECT, ORG)).resolves.toBe(
        'Be concise',
      );
    });
  });

  describe('getProjectDetail', () => {
    const USER = 'user-1';

    it('throws NotFoundException when the caller cannot view the project (no access-control bypass)', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue(null); // getEffectiveProjectPermission's lookup
      projectOps.findUniqueOrThrow.mockResolvedValue({ id: PROJECT });

      await expect(
        service.getProjectDetail(PROJECT, ORG, USER),
      ).rejects.toThrow(NotFoundException);
      expect(projectOps.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('returns the project when the caller is the owner', async () => {
      const { service, projectOps } = makeService();
      projectOps.findFirst.mockResolvedValue({ id: PROJECT, ownerId: USER });
      projectOps.findUniqueOrThrow.mockResolvedValue({
        id: PROJECT,
        title: 'My project',
      });

      const result = await service.getProjectDetail(PROJECT, ORG, USER);

      expect(result).toEqual({ id: PROJECT, title: 'My project' });
    });
  });
});
