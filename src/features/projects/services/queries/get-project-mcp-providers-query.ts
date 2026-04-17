import db from '@ragenai/prisma-client';

export async function getProjectMcpProvidersQuery(
  projectId: string,
): Promise<string[]> {
  const settings = await db.projectSettings.findUnique({
    where: { projectId },
    select: { enabledMcpProviders: true },
  });

  return settings?.enabledMcpProviders ?? [];
}
