'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const getThreadDetailsQuery = async (
  publicThreadId: string,
  orgId: string,
  options?: { includeMessages?: boolean },
) => {
  try {
    const thread = await db.thread.findFirstOrThrow({
      where: {
        publicId: publicThreadId,
        organizationId: orgId,
      },
      select: {
        id: true,
        publicId: true,
        createdAt: true,
        visitorId: true,
        preferredCommunicationType: true,
        preferredModel: true,
        projectId: true,
        mentionedProjectId: true,
        teamId: true,
        project: {
          select: {
            publicId: true,
            id: true,
            title: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        ...(options?.includeMessages
          ? {
              messages: {
                select: {
                  role: true,
                  content: true,
                },
                orderBy: { createdAt: 'asc' as const },
              },
            }
          : {}),
      },
    });

    // Convert Date object to ISO string for serialization
    return {
      ...thread,
      createdAt: thread.createdAt.toISOString(),
    };
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${publicThreadId}`);
    throw error;
  }
};

export const getThreadMessagesListQuery = async (
  publicThreadId: string,
  orgId: string,
) => {
  try {
    const thread = await db.thread.findFirst({
      where: {
        publicId: publicThreadId,
        organizationId: orgId,
      },
      select: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    // Convert Date objects to ISO strings for serialization
    if (thread?.messages) {
      return {
        ...thread,
        messages: thread.messages.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
        })),
      };
    }

    return thread;
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${publicThreadId}`);
    throw error;
  }
};
