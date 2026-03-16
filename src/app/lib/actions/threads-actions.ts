'use server';

import { logger } from '../utils/logger';
import { getThreadDetailsQuery } from '@/features/threads/services/queries/get-thread-details-query';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';

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
  threadId: string,
): Promise<ThreadDetailsAction> => {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    const threadRecord = await getThreadDetailsQuery(threadId, orgId);

    return {
      success: true,
      preferredModel: threadRecord.preferredModel,
    };
  } catch (error) {
    logger.error({ err: error, threadId }, 'Error fetching thread details');
    return {
      success: false,
      errorMessage: 'Failed to fetch thread details',
    };
  }
};
