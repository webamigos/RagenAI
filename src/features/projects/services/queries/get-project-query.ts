'use server';

import db from '@ragenai/prisma-client';
import type { Project } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import type { PublicProjectDto } from '../../contracts/project.types';

export const getProjectByPublicIdQuery = async (
  publicId: Project['publicId'],
) => {
  try {
    return await getProjectByPublicIdOrThrowQuery(publicId);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching project by public ID');
    throw error;
  }
};

export const getProjectByPublicIdOrThrowQuery = async (
  publicId: Project['publicId'],
) => {
  return await db.project.findUniqueOrThrow({
    where: {
      publicId: publicId,
    },
    select: {
      id: true,
      publicId: true,
      title: true,
      threads: {
        orderBy: { createdAt: 'desc' },
        select: {
          publicId: true,
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
