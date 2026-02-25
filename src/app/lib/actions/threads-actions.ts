'use server';

import { logger } from '../utils/logger';
import { getThreadDetailsQuery } from '@/features/threads/services/queries/get-thread-details-query';

type ThreadDetailsAction =
  | {
      success: true;
      preferredModel: string | null;
    }
  | {
      success: false;
      errorMessage: string;
    };

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
