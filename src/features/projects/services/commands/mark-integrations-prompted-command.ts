'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { requireProjectAccess } from '../utils/require-project-access';

export async function markIntegrationsPromptedCommand(
  projectId: string,
): Promise<{ success: boolean }> {
  try {
    await requireProjectAccess(projectId, 'manage');

    const now = new Date();
    await db.projectSettings.upsert({
      where: { projectId },
      update: { integrationsPromptedAt: now },
      create: { projectId, integrationsPromptedAt: now },
    });

    return { success: true };
  } catch (error) {
    logger.error(
      { err: error, projectId },
      'Error marking integrations prompted',
    );
    throw error;
  }
}
