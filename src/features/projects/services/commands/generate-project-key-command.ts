'use server';

import crypto from 'crypto';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { requireProjectAccess } from '../utils/require-project-access';

export const generateProjectKeyCommand = async (projectId: string) => {
  try {
    await requireProjectAccess(projectId, 'owner');

    const existing = await db.project.findUnique({
      where: { id: projectId },
    });

    if (!existing) {
      throw new Error('Project not found');
    }

    logger.info('Generating access token for project');

    const project = await db.project.update({
      where: { id: existing.id },
      data: {
        accessToken: crypto.randomUUID(),
        isPublic: true,
        publishedAt: new Date(),
      },
      select: {
        accessToken: true,
      },
    });

    trackAudit({
      action: 'project.key_generated',
      entityType: 'project',
      entityId: projectId,
    });

    return {
      accessToken: project.accessToken,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error generating access token:');
    throw new Error('Failed to generate access token');
  }
};
