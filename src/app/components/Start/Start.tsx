'use client';

import { useTranslations } from 'next-intl';
import { RocketLaunchIcon } from '@heroicons/react/24/outline';
import { useUser } from '@clerk/nextjs';
import { Alert, Button } from '@salesyy/common-ui';
import { useNewThread } from '@/app/hooks/useNewThread';
import { useOnboardingContext } from '@/app/hooks/useOnboardingContext';
import { OnboardingSteps } from './OnboardingSteps';
import { useEffect } from 'react';

export const Start = () => {
  const { isSignedIn } = useUser();

  const t = useTranslations('Index');
  const { handleNewThread, isLoading, isPending, isLimitLock } = useNewThread();
  const { runJoyride } = useOnboardingContext();

  useEffect(() => {
    runJoyride();
  }, []);

  return (
    <div className="container mx-auto h-full">
      <div className="flex flex-col h-full items-center justify-center">
        <OnboardingSteps />
        {!isPending && (
          <Button
            label={t('start-new-thread')}
            className="start-button px-8 py-4 sm:mb-12 mb-8 bg-primary-blue-400 hover:bg-primary-blue-500 disabled:bg-primary-blue-500 dark:bg-accent-dark-500 dark:hover:bg-accent-dark-700 dark:disabled:bg-accent-dark-300 font-sans tracking-wide rounded-3xl"
            onClick={handleNewThread}
            isLoading={isLoading}
            disabled={isLoading || isLimitLock}
            iconRight={
              <RocketLaunchIcon
                className="h-5 w-5 flex-none text-white cursor-pointer"
                aria-hidden="true"
              />
            }
          />
        )}
        {isLimitLock && !isSignedIn && (
          <Alert title={t('limit-reached')} type="info" />
        )}
      </div>
    </div>
  );
};
