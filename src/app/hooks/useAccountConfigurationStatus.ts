import { useEffect, useRef, useState } from 'react';
import { logger } from '@/app/lib/utils/logger';
import { getAccountSetupStatusAction } from '../actions';
import { finalizeUserOnboarding } from '@/app/lib/actions/onboarding';

import type { AccountSetupStatus } from '@/app/lib/types/account-setup';

const MAX_RETRIES = 60;

type HookInputType = Readonly<{
  refetchInterval?: number;
  onSuccessCallback?: (status: AccountSetupStatus) => void;
  onErrorCallback?: () => void;
}>;

type HookOutputType = Readonly<{
  isPolling: boolean;
  isError: boolean;
  status: AccountSetupStatus | null;
  handleTryAgain: () => void;
}>;

export function useAccountSetupStatus({
  refetchInterval = 1000,
  onSuccessCallback,
  onErrorCallback,
}: HookInputType): HookOutputType {
  const checkInProgressRef = useRef(false);
  const retryCountRef = useRef(0);

  const [status, setStatus] = useState<AccountSetupStatus | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const handleTryAgain = () => {
    setIsError(false);
    retryCountRef.current = 0;
  };

  useEffect(() => {
    if (isError) {
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      if (checkInProgressRef.current) {
        return;
      }

      checkInProgressRef.current = true;
      retryCountRef.current++;

      try {
        if (retryCountRef.current > MAX_RETRIES) {
          throw new Error('Max retries reached');
        }

        const status = await getAccountSetupStatusAction();

        setStatus(status);
        const setupComplete = status?.accountSetupComplete;

        if (setupComplete) {
          logger.info(
            'Account configuration complete, finalizing onboarding...'
          );

          // Use Better Auth instead of Clerk stub
          try {
            await finalizeUserOnboarding();
          } catch (err) {
            logger.error({ err }, 'Failed to finalize onboarding');
            // Continue anyway - status check passed
          }

          onSuccessCallback?.(status);
          return;
        } else {
          logger.info('Account configuration not complete, retrying...');
          timeoutId = setTimeout(poll, refetchInterval);
        }
      } catch (err) {
        logger.error({ err }, 'Error checking for organization');
        onErrorCallback?.();
        setIsError(true);
        setIsPolling(false);
      } finally {
        checkInProgressRef.current = false;
      }
    };

    poll();
    return () => clearTimeout(timeoutId);
  }, [refetchInterval, isError, onSuccessCallback, onErrorCallback]);

  return {
    isError,
    isPolling,
    handleTryAgain,
    status,
  };
}
