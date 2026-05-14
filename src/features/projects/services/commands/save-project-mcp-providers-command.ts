import db from '@ragenai/prisma-client';
import { requireProjectAccess } from '../utils/require-project-access';

export async function saveProjectMcpProvidersCommand(
  projectId: string,
  enabledMcpProviders: string[],
): Promise<void> {
  await requireProjectAccess(projectId, 'manage');

  await db.projectSettings.upsert({
    where: { projectId },
    update: { enabledMcpProviders },
    create: { projectId, enabledMcpProviders },
  });
}
