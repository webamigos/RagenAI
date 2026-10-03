'use server';

import { logger } from '@/app/lib/utils/logger';
import {
  getCurrentUserId,
  getOrgIdFromAuthOrThrow,
} from '@/app/lib/utils/auth-helpers';
import type { ThreadContextAction } from '../../contracts/thread.types';
import { setThreadProjectContext } from './set-thread-project-context';

/**
 * The project-context picker's action: point one of the caller's threads at
 * a project they can see, or at none. Organization and user come from the
 * session; the rule is `setThreadProjectContext`'s.
 */
export const updateThreadContextCommand = async (
  threadId: string,
  mentionedProjectId: string | null,
): Promise<ThreadContextAction> => {
  try {
    const organizationId = await getOrgIdFromAuthOrThrow();
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, errorMessage: 'Unauthorized' };
    }

    const change = await setThreadProjectContext({
      threadId,
      organizationId,
      userId,
      mentionedProjectId,
    });
    if (change.status === 'thread-not-found') {
      return { success: false, errorMessage: 'Thread not found' };
    }
    if (change.status === 'project-not-found') {
      return {
        success: false,
        errorMessage: 'Project not found or access denied',
      };
    }

    logger.info(
      { threadId, mentionedProjectId: change.mentionedProjectId },
      'Thread context updated successfully',
    );
    return { success: true, mentionedProjectId: change.mentionedProjectId };
  } catch (error) {
    logger.error(
      { err: error, threadId, mentionedProjectId },
      'Error updating thread context',
    );
    return { success: false, errorMessage: 'Failed to update thread context' };
  }
};
