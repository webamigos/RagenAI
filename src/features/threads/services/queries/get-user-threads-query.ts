'use server';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getDefaultProjectIdQuery as fetchOrganizationDefaultProjectId } from '@/features/projects/services/queries/get-default-project-query';
import { logger } from '@/app/lib/utils/logger';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';

export const getUserThreadsQuery = async (
  visitorId: string,
  skip?: number,
  take?: number,
  query?: string,
) => {
  //Remove the restriction to the last 30 days in the future if it is no longer required.
  //the constraint is only supported when query is defined
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const orgId = await getOrgIdFromAuthOrThrow();
  const defaultProjectId = await fetchOrganizationDefaultProjectId(orgId);

  if (!defaultProjectId) {
    logger.error({ orgId }, 'Default project ID does not exist!');
    throw new Error('Default project ID does not exist!');
  }

  const threads = await db.thread.findMany({
    where: {
      visitorId: visitorId,
      projectId: defaultProjectId,
      messages: query
        ? {
            some: {
              createdAt: {
                gte: thirtyDaysAgo,
              },
              content: {
                contains: query,
                mode: 'insensitive',
              },
            },
          }
        : {
            some: {},
          },
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip: skip,
    take: take,
    select: {
      id: true,
      createdAt: true,
      visitorId: true,
      projectId: true,
      isStarred: true,
      encryptedDek: true,
      messages: {
        select: {
          content: true,
          createdAt: true,
          role: true,
        },
      },
    },
  });

  // Decrypt messages and convert Date objects to ISO strings for Redux serialization
  const results = await Promise.all(
    threads.map(async (thread) => {
      let decryptedMessages;
      try {
        decryptedMessages = await decryptMessageContents(
          thread.messages,
          thread.encryptedDek,
        );
      } catch (error) {
        logger.error(
          { err: error, threadId: thread.id },
          'Failed to decrypt thread messages',
        );
        decryptedMessages = thread.messages.map((msg) => ({
          ...msg,
          content: '',
        }));
      }
      const { encryptedDek: _, ...threadData } = thread;
      return {
        ...threadData,
        createdAt: thread.createdAt.toISOString(),
        messages: decryptedMessages.map((msg) => ({
          ...msg,
          createdAt: msg.createdAt.toISOString(),
        })),
      };
    }),
  );

  return results;
};
