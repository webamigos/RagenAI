import db from '@ragenai/prisma-client';
import { NotFoundException } from '@/libs/utils/errors';
import { requireProjectAccess } from '../utils/require-project-access';

export async function saveProjectInstructionCommand(
  projectId: string,
  instruction: string,
): Promise<void> {
  if (!projectId) {
    throw new NotFoundException('Project ID is required');
  }

  await requireProjectAccess(projectId, 'manage');

  await db.projectSettings.upsert({
    where: { projectId },
    update: { instructions: instruction },
    create: { projectId, instructions: instruction },
  });
}
