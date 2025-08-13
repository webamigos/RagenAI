'use server';

import db from '@ragenai/prisma-client';
import { Thread } from '@prisma/client';
import { setSentryServiceTag } from '../services/sentry';
import {
  createNewThreadInDb,
  updateThreadProjectContext,
  removeThreadProjectContext,
} from '../services/thread';
import { logger } from '../utils/logger';
import { createAndStoreMessage } from '../services/message';
import { getVisitorIdFromCookie } from '../services/cookies';
import { auth } from '@clerk/nextjs/server';
import { ThreadDocumentUI } from '../../contracts/ThreadDocument';

type ThreadAction =
  | {
      success: true;
      thread: {
        public_id: Thread['public_id'];
        project_id?: number;
      };
    }
  | {
      success: false;
      errorMessage: string;
    };

export const createThreadAction = async (
  projectId?: number,
  mentionedProjectId?: number,
  preferredModel?: string,
  threadDocuments?: ThreadDocumentUI[]
): Promise<ThreadAction> => {
  try {
    setSentryServiceTag('threads');

    const thread = await createNewThreadInDb({
      visitorId: null,
      projectId,
      mentionedProjectId,
      preferredModel,
      threadDocuments,
    });

    return {
      success: true,
      thread: {
        public_id: thread.public_id,
        project_id: thread.project_id,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};

export const createGuestThreadAction = async ({
  organizationId,
  projectId,
  initialMessage,
  mentionedProjectId,
  preferredModel,
}: {
  organizationId?: string;
  projectId?: number;
  initialMessage?: string;
  mentionedProjectId?: number;
  preferredModel?: string;
}): Promise<ThreadAction> => {
  try {
    setSentryServiceTag('guest-threads');

    const visitorId = await getVisitorIdFromCookie();

    const threadRecord = await db.thread.create({
      data: {
        organization_id: organizationId,
        visitor_id: visitorId,
        project_id: projectId,
        mentioned_project_id: mentionedProjectId,
        preferred_model: preferredModel,
      },
    });

    if (initialMessage && visitorId) {
      await createAndStoreMessage({
        threadId: threadRecord.id,
        prompt: initialMessage,
        visitorId: visitorId,
      });
    }

    return {
      success: true,
      thread: {
        public_id: threadRecord.public_id,
        project_id: projectId,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create guest thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};

type ThreadContextAction =
  | {
      success: true;
      mentionedProjectId: number | null;
    }
  | {
      success: false;
      errorMessage: string;
    };

export const updateThreadContextAction = async (
  threadId: string,
  mentionedProjectId: number | null
): Promise<ThreadContextAction> => {
  try {
    setSentryServiceTag('thread-context');

    const { orgId } = auth();
    if (!orgId) {
      return {
        success: false,
        errorMessage: 'Unauthorized',
      };
    }

    // Verify thread belongs to user's organization
    const thread = await db.thread.findFirst({
      where: {
        public_id: threadId,
        organization_id: orgId,
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
          organization_id: orgId,
        },
      });

      if (!project) {
        return {
          success: false,
          errorMessage: 'Project not found or access denied',
        };
      }
    }

    // Update thread context using service function
    const updatedThread = await updateThreadProjectContext(
      threadId,
      mentionedProjectId
    );

    logger.info(
      {
        threadId,
        mentionedProjectId: updatedThread.mentioned_project_id,
        orgId,
      },
      'Thread context updated successfully'
    );

    return {
      success: true,
      mentionedProjectId: updatedThread.mentioned_project_id,
    };
  } catch (error) {
    logger.error(
      { err: error, threadId, mentionedProjectId },
      'Error updating thread context'
    );
    return {
      success: false,
      errorMessage: 'Failed to update thread context',
    };
  }
};

export const removeThreadContextAction = async (
  threadId: string
): Promise<ThreadContextAction> => {
  try {
    setSentryServiceTag('thread-context');

    const { orgId } = auth();
    if (!orgId) {
      return {
        success: false,
        errorMessage: 'Unauthorized',
      };
    }

    // Verify thread belongs to user's organization
    const thread = await db.thread.findFirst({
      where: {
        public_id: threadId,
        organization_id: orgId,
      },
    });

    if (!thread) {
      return {
        success: false,
        errorMessage: 'Thread not found',
      };
    }

    // Remove thread context using service function
    const updatedThread = await removeThreadProjectContext(threadId);

    logger.info(
      {
        threadId,
        orgId,
      },
      'Thread context removed successfully'
    );

    return {
      success: true,
      mentionedProjectId: updatedThread.mentioned_project_id, // should be null
    };
  } catch (error) {
    logger.error({ err: error, threadId }, 'Error removing thread context');
    return {
      success: false,
      errorMessage: 'Failed to remove thread context',
    };
  }
};
