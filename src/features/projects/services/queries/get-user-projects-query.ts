'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const getUserProjectsQuery = async (
  organizationId: string,
  userId: string,
) => {
  try {
    const projects = await db.project.findMany({
      where: {
        organizationId: organizationId,
        ownerId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        publicId: true,
        title: true,
        createdAt: true,
        organizationId: true,
        threads: {
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            publicId: true,
            createdAt: true,
            visitorId: true,
            preferredCommunicationType: true,
            projectId: true,
            messages: {
              orderBy: {
                createdAt: 'asc',
              },
              select: {
                content: true,
              },
            },
          },
        },
      },
    });

    // Convert Date objects to ISO strings for Redux serialization
    return projects.map((project) => ({
      ...project,
      createdAt: project.createdAt.toISOString(),
      threads: project.threads.map((thread) => ({
        ...thread,
        createdAt: thread.createdAt.toISOString(),
      })),
    }));
  } catch (error) {
    logger.error({ err: error }, 'Error fetching projects for user');
    throw error;
  }
};
