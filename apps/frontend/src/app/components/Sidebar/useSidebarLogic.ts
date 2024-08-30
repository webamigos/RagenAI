import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

import { getUserMessages } from '../../actions';
import { loadFingerprint } from '../../lib/utils/fingerprint';
import { logger } from '../../lib/utils/logger';
import { useThreadsContext } from '../../hooks/useThreadsContext';

export const useSidebarLogic = () => {
  const { state, dispatch } = useThreadsContext();
  const { userThreads, error, isLoading } = state;

  const { push } = useRouter();
  const { user, isSignedIn } = useUser();

  const noThreads = userThreads.length === 0;

  const fetchData = useCallback(async () => {
    dispatch({ type: 'LOADING' });
    try {
      const visitorId = await loadFingerprint();
      const data = await getUserMessages(visitorId);
      dispatch({
        type: 'USER_THREADS',
        payload: data.threads || [],
      });
    } catch (error) {
      dispatch({ type: 'ERROR', payload: 'Failed to fetch user threads' });
      logger.error(error);
    }
  }, [dispatch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleThreadClick = (threadId: string) => {
    push(`/threads/${threadId}`);
  };

  return {
    user,
    error,
    noThreads,
    isLoading,
    isSignedIn,
    userThreads,
    handleThreadClick,
  };
};
