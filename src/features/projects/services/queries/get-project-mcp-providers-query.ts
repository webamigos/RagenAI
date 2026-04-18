import db from '@ragenai/prisma-client';

export async function getProjectMcpProvidersQuery(
  projectId: string,
  organizationId?: string,
): Promise<string[]> {
  if (organizationId) {
    const project = await db.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) {
      return [];
    }
  }

  const settings = await db.projectSettings.findUnique({
    where: { projectId },
    select: { enabledMcpProviders: true },
  });

  return settings?.enabledMcpProviders ?? [];
}
