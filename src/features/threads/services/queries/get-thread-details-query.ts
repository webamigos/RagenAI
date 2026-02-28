'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const getThreadDetailsQuery = async (
  publicThreadId: string,
  orgId?: string,
) => {
  try {
    const thread = await db.thread.findFirstOrThrow({
      where: {
        public_id: publicThreadId,
        ...(orgId ? { project: { organization_id: orgId } } : {}),
      },
      select: {
        id: true,
        public_id: true,
        created_at: true,
        visitor_id: true,
        preferred_communication_type: true,
        preferred_model: true,
        project_id: true,
        mentioned_project_id: true,
        project: {
          select: {
            public_id: true,
            id: true,
            title: true,
          },
        },
      },
    });

    // Convert Date object to ISO string for serialization
    return {
      ...thread,
      created_at: thread.created_at.toISOString(),
    };
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${publicThreadId}`);
    throw error;
  }
};

export const getThreadMessagesListQuery = async (
  publicThreadId: string,
  orgId?: string,
) => {
  try {
    const thread = await db.thread.findFirst({
      where: {
        public_id: publicThreadId,
        ...(orgId ? { project: { organization_id: orgId } } : {}),
      },
      select: {
        messages: {
          orderBy: {
            created_at: 'asc',
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
          created_at: message.created_at.toISOString(),
        })),
      };
    }

    return thread;
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${publicThreadId}`);
    throw error;
  }
};
