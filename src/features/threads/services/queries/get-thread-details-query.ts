'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';

export const getThreadDetailsQuery = async (
  publicThreadId: string,
  orgId: string,
  options?: { includeMessages?: boolean },
) => {
  try {
    const thread = await db.thread.findFirstOrThrow({
      where: {
        id: publicThreadId,
        organizationId: orgId,
      },
      select: {
        id: true,
        createdAt: true,
        visitorId: true,
        preferredCommunicationType: true,
        preferredModel: true,
        projectId: true,
        mentionedProjectId: true,
        teamId: true,
        encryptedDek: true,
        project: {
          select: {
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

    // Decrypt messages if thread is encrypted and messages were included
    let messages: { role: string; content: string }[] | undefined;
    if ('messages' in thread && Array.isArray(thread.messages)) {
      try {
        messages = await decryptMessageContents(
          thread.messages as { role: string; content: string }[],
          thread.encryptedDek,
        );
      } catch (error) {
        logger.error(
          { err: error, threadId: thread.id },
          'Failed to decrypt thread messages',
        );
        messages = thread.messages as { role: string; content: string }[];
      }
    }

    // Exclude encryptedDek from response
    const { encryptedDek: _, ...threadData } = thread;

    // Convert Date object to ISO string for serialization
    return {
      ...threadData,
      ...(messages ? { messages } : {}),
      createdAt: threadData.createdAt.toISOString(),
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
        id: publicThreadId,
        organizationId: orgId,
      },
      select: {
        encryptedDek: true,
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    // Convert Date objects to ISO strings for serialization
    if (thread?.messages) {
      const decryptedMessages = await decryptMessageContents(
        thread.messages,
        thread.encryptedDek,
      );

      const { encryptedDek: _, ...threadData } = thread;
      return {
        ...threadData,
        messages: decryptedMessages.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
        })),
      };
    }

    if (thread) {
      const { encryptedDek: _, ...threadData } = thread;
      return threadData;
    }

    return thread;
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${publicThreadId}`);
    throw error;
  }
};
