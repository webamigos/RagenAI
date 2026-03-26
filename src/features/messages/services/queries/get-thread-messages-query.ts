'use server';

import { type Thread } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { MessageAttachment } from '../../contracts/message.types';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';

export const getThreadMessagesQuery = async (
  threadPublicId: Thread['publicId'],
  visitorId: Thread['visitorId'],
) => {
  try {
    const thread = await db.thread.findFirst({
      where: { publicId: threadPublicId, visitorId: visitorId },
      select: {
        id: true,
        encryptedDek: true,
        mentionedProjectId: true,
        project: {
          select: {
            id: true,
            publicId: true,
            title: true,
          },
        },
      },
    });

    if (!thread) {
      return { messages: [], threadContext: null };
    }

    const rawMessages = await db.message.findMany({
      where: { threadId: thread.id },
      select: {
        publicId: true,
        createdAt: true,
        content: true,
        role: true,
        runId: true,
        rate: true,
        voiceDurationSeconds: true,
        messageType: true,
        voicePlayed: true,
        attachments: true,
      },
      orderBy: [
        {
          createdAt: 'asc',
        },
      ],
    });

    let messages;
    try {
      messages = await decryptMessageContents(rawMessages, thread.encryptedDek);
    } catch (error) {
      logger.error(
        { err: error, threadId: thread.id },
        'Failed to decrypt thread messages',
      );
      messages = rawMessages;
    }

    // Get mentioned project details if exists
    let mentionedProject = null;
    if (thread.mentionedProjectId) {
      try {
        mentionedProject = await db.project.findUnique({
          where: { id: thread.mentionedProjectId },
          select: {
            id: true,
            publicId: true,
            title: true,
          },
        });

        // If mentioned project doesn't exist, log warning but continue
        if (!mentionedProject) {
          logger.warn(
            {
              threadId: thread.id,
              mentionedProjectId: thread.mentionedProjectId,
            },
            'Mentioned project not found, will fallback to regular thread project',
          );
        }
      } catch (error) {
        logger.error(
          {
            err: error,
            threadId: thread.id,
            mentionedProjectId: thread.mentionedProjectId,
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
        createdAt: message.createdAt.toISOString(),
        attachments:
          (message.attachments as MessageAttachment[] | null) ?? undefined,
      })),
      threadContext: {
        project: thread.project,
        mentionedProject,
        mentionedProjectId: thread.mentionedProjectId,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch messages from DB');
    throw error;
  }
};
