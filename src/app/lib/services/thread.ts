import db from '@ragenai/prisma-client';
import { auth } from '@clerk/nextjs/server';

import { type CreateThreadDto } from '../../contracts/ThreadDto';
import { setSentryContext, setSentryServiceTag } from './sentry';
import { logger } from '../utils/logger';
import { fetchOrganizationDefaultProjectId } from './project';

export const serviceName = 'thread';

export const findOrCreateThread = async (
  threadPublicId: CreateThreadDto['public_id'],
  visitorId: string
) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      threadPublicId,
    });
    setSentryContext('EXTRA_DATA', {
      visitorId,
    });

    const threadRecord = await db.thread.findUniqueOrThrow({
      where: { public_id: threadPublicId },
    });

    await db.thread.update({
      where: { public_id: threadPublicId },
      data: {
        visitor_id: visitorId,
      },
    });

    return { threadRecord };
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${threadPublicId}`);
    // TODO: implement
    throw new Error(`Cannot fetch thread ${threadPublicId}`);
  }
};

export const createNewThreadInDb = async ({
  visitorId,
  projectId,
  mentionedProjectId,
}: {
  visitorId: string | null | undefined;
  projectId?: number;
  mentionedProjectId?: number;
}) => {
  try {
    setSentryServiceTag(serviceName);

    const { userId, orgId } = auth();
    if (!orgId) {
      throw new Error('Organization ID is required');
    }

    const defaultProjectId = await fetchOrganizationDefaultProjectId(orgId);
    const filteredProjectId = projectId ?? defaultProjectId;

    if (!filteredProjectId) {
      throw new Error('No project id');
    }

    const threadRecord = await db.thread.create({
      data: {
        organization_id: orgId,
        user_id: userId,
        project_id: projectId ?? defaultProjectId,
        mentioned_project_id: mentionedProjectId,
        visitor_id: userId ? userId : visitorId,
      },
    });

    return {
      public_id: threadRecord.public_id,
      project_id: filteredProjectId,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create new thread');
    throw error;
  }
};

export const getThreadMessages = async (publicThreadId: string) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      publicThreadId,
    });
    return await db.thread.findUnique({
      where: {
        public_id: publicThreadId,
      },
      select: {
        messages: {
          orderBy: {
            created_at: 'asc',
          },
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${publicThreadId}`);
    throw error;
  }
};

export const getThreadDetails = async (publicThreadId: string) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      publicThreadId,
    });
    return await db.thread.findUniqueOrThrow({
      where: { public_id: publicThreadId },
      select: {
        id: true,
        public_id: true,
        created_at: true,
        visitor_id: true,
        preferred_communication_type: true,
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
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${publicThreadId}`);
    throw error;
  }
};

export const updateThreadProjectContext = async (
  publicThreadId: string,
  mentionedProjectId: number | null
) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      publicThreadId,
    });
    setSentryContext('EXTRA_DATA', {
      mentionedProjectId,
    });

    const updatedThread = await db.thread.update({
      where: { public_id: publicThreadId },
      data: { mentioned_project_id: mentionedProjectId },
      select: {
        id: true,
        public_id: true,
        mentioned_project_id: true,
      },
    });

    logger.info(
      {
        threadId: publicThreadId,
        mentionedProjectId,
      },
      'Thread project context updated successfully'
    );

    return updatedThread;
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to update thread context ${publicThreadId}`
    );
    throw error;
  }
};

export const removeThreadProjectContext = async (publicThreadId: string) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      publicThreadId,
    });

    const updatedThread = await db.thread.update({
      where: { public_id: publicThreadId },
      data: { mentioned_project_id: null },
      select: {
        id: true,
        public_id: true,
        mentioned_project_id: true,
      },
    });

    logger.info(
      {
        threadId: publicThreadId,
      },
      'Thread project context removed successfully'
    );

    return updatedThread;
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to remove thread context ${publicThreadId}`
    );
    throw error;
  }
};
