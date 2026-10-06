import { canManageOrg } from '@/lib/auth-access-control';
import db from '@ragenai/prisma-client';
import { APIError } from 'better-auth/api';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { resolveProjectPermissionForMember } from '@/features/projects/services/queries/resolve-project-permission-for-member';

/** Internal query: its actor comes from Better Auth, never a posted user id. */
export async function assertMcpGrantContext(
  userId: string,
  organizationId: string,
  projectId?: string,
) {
  const member = await db.member.findFirst({
    where: { userId, organizationId },
    include: { user: true, organization: true },
  });
  if (
    !member ||
    (member.user.banned &&
      (!member.user.banExpires || member.user.banExpires > new Date())) ||
    !(await isFeatureEnabledQuery(organizationId, 'mcpOAuth'))
  ) {
    throw new APIError('FORBIDDEN', {
      message: 'MCP connection is unavailable for this organization',
    });
  }
  if (projectId) {
    const permission = await resolveProjectPermissionForMember(
      projectId,
      organizationId,
      userId,
      member.role,
    );
    if (!permission.canView) {
      throw new APIError('FORBIDDEN', { message: 'Assistant is unavailable' });
    }
  }
  return member;
}

export async function getMcpWorkspaceOptions(userId: string) {
  const memberships = await db.member.findMany({
    where: { userId },
    include: { organization: true },
  });
  const options = [];
  for (const member of memberships) {
    if (!(await isFeatureEnabledQuery(member.organizationId, 'mcpOAuth'))) {
      continue;
    }
    const projects = await db.project.findMany({
      where: { organizationId: member.organizationId, isArchived: false },
      select: { id: true, title: true, ownerId: true },
    });
    const teams = await db.teamMember.findMany({
      where: { userId, team: { organizationId: member.organizationId } },
      select: { teamId: true },
    });
    const grants = await db.projectPermission.findMany({
      where: {
        projectId: { in: projects.map((project) => project.id) },
        OR: [
          { granteeType: 'user', granteeId: userId },
          {
            granteeType: 'team',
            granteeId: { in: teams.map((team) => team.teamId) },
          },
        ],
      },
      select: { projectId: true },
    });
    const shared = new Set(grants.map((grant) => grant.projectId));
    const assistants = projects
      .filter(
        (project) =>
          project.ownerId === userId ||
          canManageOrg(member.role) ||
          project.ownerId === null ||
          shared.has(project.id),
      )
      .map(({ id, title }) => ({ id, title }));
    options.push({
      id: member.organizationId,
      name: member.organization.name,
      assistants,
    });
  }
  return options;
}
