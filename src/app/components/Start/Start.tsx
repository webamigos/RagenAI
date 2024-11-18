'use client';

import { RocketLaunchIcon } from '@heroicons/react/24/outline';
import { useUser } from '@clerk/nextjs';
import { Alert, Button } from '@salesyy/common-ui';
import { useTranslations } from 'next-intl';

import { useNewThread } from '@/app/hooks/useNewThread';
import { useOnboardingContext } from '@/app/hooks/useOnboardingContext';
import { useSettings } from '@/app/hooks/useSettings';

import { OnboardingSteps } from './OnboardingSteps';
import { ValidationBoard } from './ValidationBoard';

export const Start = () => {
  const { isSignedIn } = useUser();
  const t = useTranslations('Index');
  const { handleNewThread, isLoading, isPending, isLimitLock } = useNewThread();
  const { runJoyride, showOnboarding } = useOnboardingContext();
  const { hasApiKey, BelongsToOrganization, hasKnowledge } = useSettings();

  const shouldShowValidationBoard =
    !showOnboarding && (!hasApiKey || !hasKnowledge || !BelongsToOrganization);

  return (
    <div className="container mx-auto h-full">
      <div className="flex flex-col h-full items-center justify-center">
        <OnboardingSteps />
        {shouldShowValidationBoard ? (
          <ValidationBoard />
        ) : !isPending && showOnboarding ? (
          <Button
            label={t('start-tour')}
            onClick={runJoyride}
            className="start-button px-8 py-4 sm:mb-12 mb-8 bg-primary-blue-400 hover:bg-primary-blue-500 disabled:bg-primary-blue-500 dark:bg-accent-dark-500 dark:hover:bg-accent-dark-700 dark:disabled:bg-accent-dark-300 font-sans tracking-wide rounded-3xl"
          />
        ) : (
          <Button
            label={t('start-new-thread')}
            className="px-5 py-3 sm:mb-12 mb-8"
            onClick={handleNewThread}
            isLoading={isLoading}
            disabled={isLoading || isLimitLock || showOnboarding}
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
