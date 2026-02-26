'use server';

import { type Thread } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const getThreadMessagesQuery = async (
  threadPublicId: Thread['public_id'],
  visitorId: Thread['visitor_id'],
) => {
  try {
    const thread = await db.thread.findUnique({
      where: { public_id: threadPublicId, visitor_id: visitorId },
      include: {
        project: {
          select: {
            id: true,
            public_id: true,
            title: true,
          },
        },
      },
    });

    if (!thread) {
      return { messages: [], threadContext: null };
    }

    const messages = await db.message.findMany({
      where: { thread_id: thread?.id },
      select: {
        public_id: true,
        created_at: true,
        content: true,
        role: true,
        run_id: true,
        rate: true,
        voice_duration_seconds: true,
        message_type: true,
        voice_played: true,
      },
      orderBy: [
        {
          created_at: 'asc',
        },
      ],
    });

    // Get mentioned project details if exists
    let mentionedProject = null;
    if (thread.mentioned_project_id) {
      try {
        mentionedProject = await db.project.findUnique({
          where: { id: thread.mentioned_project_id },
          select: {
            id: true,
            public_id: true,
            title: true,
          },
        });

        // If mentioned project doesn't exist, log warning but continue
        if (!mentionedProject) {
          logger.warn(
            {
              threadId: thread.id,
              mentionedProjectId: thread.mentioned_project_id,
            },
            'Mentioned project not found, will fallback to regular thread project',
          );
        }
      } catch (error) {
        logger.error(
          {
            err: error,
            threadId: thread.id,
            mentionedProjectId: thread.mentioned_project_id,
          },
          'Error fetching mentioned project, will fallback to regular thread project',
        );
        // mentionedProject stays null, system will use regular project
      }
    }

    // Convert Date objects to ISO strings for serialization
    return {
      messages: messages.map((message) => ({
        ...message,
        created_at: message.created_at.toISOString(),
      })),
      threadContext: {
        project: thread.project,
        mentionedProject,
        mentionedProjectId: thread.mentioned_project_id,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch messages from DB');
    throw error;
  }
};
