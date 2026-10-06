import db from '@ragenai/prisma-client';
import { resolveProjectPermissionForMember } from '@/features/projects/services/queries/resolve-project-permission-for-member';

/** Labels for a consent owned by this user; never reveal inaccessible project names. */
export async function getMcpConnectionLabels(
  userId: string,
  referenceId?: string,
) {
  const [organizationId, projectId, extra] = referenceId?.split(':') ?? [];
  if (!organizationId || !projectId || extra)
    return { organizationName: null, assistantName: null };
  const member = await db.member.findFirst({
    where: { userId, organizationId },
    include: { organization: true },
  });
  if (!member) return { organizationName: null, assistantName: null };
  let assistantName: string | null = null;
  if (projectId !== 'all') {
    const permission = await resolveProjectPermissionForMember(
      projectId,
      organizationId,
      userId,
      member.role,
    );
    if (permission.canView) {
      const project = await db.project.findFirst({
        where: { id: projectId, organizationId, isArchived: false },
        select: { title: true },
      });
      assistantName = project?.title ?? null;
    }
  }
  return { organizationName: member.organization.name, assistantName };
}

export async function getMcpConnectionLastUse(
  userId: string,
  clientId: string,
) {
  const activity = await db.mcpGrantActivity.findUnique({
    where: { userId_clientId: { userId, clientId } },
    select: { lastUsedAt: true },
  });
  return activity?.lastUsedAt ?? null;
}
