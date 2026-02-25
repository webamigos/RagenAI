'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const getUserProjectsQuery = async (
  organizationId: string,
  userId: string
) => {
  try {
    const projects = await db.project.findMany({
      where: {
        organization_id: organizationId,
        owner_id: userId,
      },
      orderBy: {
        created_at: 'desc',
      },
      select: {
        id: true,
        public_id: true,
        title: true,
        created_at: true,
        organization_id: true,
        threads: {
          orderBy: {
            created_at: 'desc',
          },
          select: {
            public_id: true,
            created_at: true,
            visitor_id: true,
            preferred_communication_type: true,
            project_id: true,
            messages: {
              orderBy: {
                created_at: 'asc',
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
      created_at: project.created_at.toISOString(),
      threads: project.threads.map((thread) => ({
        ...thread,
        created_at: thread.created_at.toISOString(),
      })),
    }));
  } catch (error) {
    logger.error({ err: error }, 'Error fetching projects for user');
    throw error;
  }
};
