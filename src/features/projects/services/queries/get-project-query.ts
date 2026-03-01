'use server';

import db from '@ragenai/prisma-client';
import type { Project } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import type { PublicProjectDto } from '../../contracts/project.types';

export const getProjectByPublicIdQuery = async (
  publicId: Project['public_id'],
) => {
  try {
    return await getProjectByPublicIdOrThrowQuery(publicId);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching project by public ID');
    throw error;
  }
};

export const getProjectByPublicIdOrThrowQuery = async (
  publicId: Project['public_id'],
) => {
  return await db.project.findUniqueOrThrow({
    where: {
      public_id: publicId,
    },
    select: {
      id: true,
      public_id: true,
      title: true,
      threads: {
        orderBy: { created_at: 'desc' },
        select: {
          public_id: true,
          title: true,
          created_at: true,
          is_starred: true,
          messages: {
            orderBy: { created_at: 'asc' },
            take: 1,
            select: { content: true },
          },
        },
      },
      organization_id: true,
      is_public: true,
      access_token: true,
      published_at: true,
      chatbot_enabled: true,
      owner_id: true,
    },
  });
};

export const getPublicProjectQuery = async (
  publicAccessTokenId: string,
): Promise<PublicProjectDto | null> => {
  try {
    const project = await db.project.findFirst({
      where: {
        access_token: publicAccessTokenId,
        is_public: true,
      },
      select: {
        organization_id: true,
        id: true,
        title: true,
      },
    });

    if (!project || !project.organization_id) {
      return null;
    }

    return {
      organizationId: project.organization_id,
      projectId: project.id,
      title: project.title,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching public project');
    throw error;
  }
};
