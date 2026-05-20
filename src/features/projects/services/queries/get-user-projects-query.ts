'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

const projectSelect = {
  id: true,
  title: true,
  createdAt: true,
  organizationId: true,
  ownerId: true,
  isStarred: true,
  isArchived: true,
  threads: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      createdAt: true,
      visitorId: true,
      preferredCommunicationType: true,
      projectId: true,
      messages: {
        orderBy: { createdAt: 'asc' as const },
        select: { content: true },
      },
    },
  },
};

export const getUserProjectsQuery = async (
  organizationId: string,
  userId: string,
  options: { includeArchived?: boolean } = {},
) => {
  const { includeArchived = false } = options;
  try {
    const teamIds = (
      await db.teamMember.findMany({
        where: { userId, team: { organizationId } },
        select: { teamId: true },
      })
    ).map((t) => t.teamId);

    const sharedProjectIds = (
      await db.projectPermission.findMany({
        where: {
          project: { organizationId },
          OR: [
            { granteeType: 'user', granteeId: userId },
            ...(teamIds.length > 0
              ? [{ granteeType: 'team', granteeId: { in: teamIds } }]
              : []),
          ],
        },
        select: { projectId: true },
      })
    ).map((p) => p.projectId);

    const projects = await db.project.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { isArchived: false }),
        OR: [
          { ownerId: userId },
          ...(sharedProjectIds.length > 0
            ? [{ id: { in: sharedProjectIds } }]
            : []),
        ],
      },
      orderBy: [{ isStarred: 'desc' }, { createdAt: 'desc' }],
      select: projectSelect,
    });

    // Visitor-scoped threads: each user only sees threads they created.
    return projects.map((project) => ({
      ...project,
      isOwned: project.ownerId === userId,
      isShared: project.ownerId !== userId,
      createdAt: project.createdAt.toISOString(),
      threads: project.threads
        .filter(
          (thread) => project.ownerId === userId || thread.visitorId === userId,
        )
        .map((thread) => ({
          ...thread,
          createdAt: thread.createdAt.toISOString(),
        })),
    }));
  } catch (error) {
    logger.error({ err: error }, 'Error fetching projects for user');
    throw error;
  }
};
