'use server';

import db from '@ragenai/prisma-client';
import { Source } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';

export const createProjectCommand = async (
  title: string,
  organizationId: string,
  userId: string,
) => {
  try {
    const project = await db.project.create({
      data: {
        title,
        organizationId: organizationId,
        ownerId: userId,
        source: Source.UI,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        organizationId: true,
        threads: true,
        ownerId: true,
        isPublic: true,
        accessToken: true,
        publishedAt: true,
        chatbotEnabled: true,
        isStarred: true,
        isArchived: true,
        archivedAt: true,
        source: true,
        templateId: true,
      },
    });

    trackAudit({
      action: 'project.created',
      entityType: 'project',
      entityId: project.id,
      newData: { title },
    });

    return project;
  } catch (error) {
    logger.error({ err: error }, 'Error creating project in database');
    throw error;
  }
};
