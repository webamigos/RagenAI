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
      select: { id: true, title: true },
    });
    const assistants = [];
    for (const project of projects) {
      const permission = await resolveProjectPermissionForMember(
        project.id,
        member.organizationId,
        userId,
        member.role,
      );
      if (permission.canView) {
        assistants.push(project);
      }
    }
    options.push({
      id: member.organizationId,
      name: member.organization.name,
      assistants,
    });
  }
  return options;
}
