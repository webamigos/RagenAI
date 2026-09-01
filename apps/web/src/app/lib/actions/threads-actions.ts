'use server';

import { logger } from '../utils/logger';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

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
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('Unauthorized');
    }
    const threadRecord = await ragenApiRequest<{
      preferredModel: string | null;
    }>({
      method: 'GET',
      path: `/v1/internal/threads/${encodeURIComponent(threadId)}`,
      userId,
      orgId,
    });

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
