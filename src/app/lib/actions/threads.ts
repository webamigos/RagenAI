// @deprecated — Import from @/features/threads/ instead
'use server';

import { logger } from '../utils/logger';
import { getThreadDetailsQuery } from '@/features/threads/services/queries/get-thread-details-query';

export { createThreadAction } from '@/features/threads/services/commands/create-thread-command';

export { createGuestThreadCommand as createGuestThreadAction } from '@/features/threads/services/commands/create-guest-thread-command';

export { updateThreadContextCommand as updateThreadContextAction } from '@/features/threads/services/commands/update-thread-context-command';

export { removeThreadContextCommand as removeThreadContextAction } from '@/features/threads/services/commands/remove-thread-context-command';

type ThreadDetailsAction =
  | {
      success: true;
      preferredModel: string | null;
    }
  | {
      success: false;
      errorMessage: string;
    };

/** @deprecated Use getThreadDetailsQuery from @/features/threads instead */
export const getThreadDetailsAction = async (
  threadId: string
): Promise<ThreadDetailsAction> => {
  try {
    const threadRecord = await getThreadDetailsQuery(threadId);

    return {
      success: true,
      preferredModel: threadRecord.preferred_model,
    };
  } catch (error) {
    logger.error({ err: error, threadId }, 'Error fetching thread details');
    return {
      success: false,
      errorMessage: 'Failed to fetch thread details',
    };
  }
};
