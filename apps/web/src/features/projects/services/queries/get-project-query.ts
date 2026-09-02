'use server';

import db from '@ragenai/prisma-client';
import type { Project } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import type { PublicProjectDto } from '../../contracts/project.types';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

export const getProjectByIdOrThrowQuery = async (
  id: Project['id'],
  organizationId: string,
) => {
  return await db.project.findUniqueOrThrow({
    where: {
      id: id,
      organizationId,
    },
    select: {
      id: true,
      title: true,
      threads: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          createdAt: true,
          isStarred: true,
        },
      },
      organizationId: true,
      isPublic: true,
      accessToken: true,
      publishedAt: true,
      chatbotEnabled: true,
      ownerId: true,
    },
  });
};

export const getPublicProjectQuery = async (
  publicAccessTokenId: string,
): Promise<PublicProjectDto | null> => {
  try {
    const project = await db.project.findFirst({
      where: {
        accessToken: publicAccessTokenId,
        isPublic: true,
      },
      select: {
        organizationId: true,
        id: true,
        title: true,
      },
    });

    if (!project || !project.organizationId) {
      return null;
    }

    // Same gate as the embedded widget: an organization with publicChatbot
    // off serves neither external chatbot surface. `null` reads to the caller
    // as "no such published project", which is what an anonymous visitor
    // holding a stale access token should learn.
    const enabled = await isFeatureEnabledQuery(
      project.organizationId,
      'publicChatbot',
    );
    if (!enabled) {
      return null;
    }

    return {
      organizationId: project.organizationId,
      projectId: project.id,
      title: project.title,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching public project');
    throw error;
  }
};
