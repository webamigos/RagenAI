'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import type { ThreadContextAction } from '../../contracts/thread.types';

export const updateThreadProjectContextCommand = async (
  publicThreadId: string,
  mentionedProjectId: number | null,
) => {
  try {
    const updatedThread = await db.thread.update({
      where: { publicId: publicThreadId },
      data: { mentionedProjectId: mentionedProjectId },
      select: {
        id: true,
        publicId: true,
        mentionedProjectId: true,
      },
    });

    logger.info(
      {
        threadId: publicThreadId,
        mentionedProjectId,
      },
      'Thread project context updated successfully',
    );

    return updatedThread;
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to update thread context ${publicThreadId}`,
    );
    throw error;
  }
};

export const updateThreadContextCommand = async (
  threadId: string,
  mentionedProjectId: number | null,
): Promise<ThreadContextAction> => {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    if (!orgId) {
      return {
        success: false,
        errorMessage: 'Unauthorized',
      };
    }

    // Verify thread belongs to user's organization
    const thread = await db.thread.findFirst({
      where: {
        publicId: threadId,
        organizationId: orgId,
      },
    });

    if (!thread) {
      return {
        success: false,
        errorMessage: 'Thread not found',
      };
    }

    // If mentionedProjectId is provided, verify user has access to the project
    if (mentionedProjectId) {
      const project = await db.project.findFirst({
        where: {
          id: mentionedProjectId,
          organizationId: orgId,
        },
      });

      if (!project) {
        return {
          success: false,
          errorMessage: 'Project not found or access denied',
        };
      }
    }

    const updatedThread = await updateThreadProjectContextCommand(
      threadId,
      mentionedProjectId,
    );

    logger.info(
      {
        threadId,
        mentionedProjectId: updatedThread.mentionedProjectId,
        orgId,
      },
      'Thread context updated successfully',
    );

    return {
      success: true,
      mentionedProjectId: updatedThread.mentionedProjectId,
    };
  } catch (error) {
    logger.error(
      { err: error, threadId, mentionedProjectId },
      'Error updating thread context',
    );
    return {
      success: false,
      errorMessage: 'Failed to update thread context',
    };
  }
};
