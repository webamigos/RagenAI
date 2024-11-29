'use client';

import { RocketLaunchIcon } from '@heroicons/react/24/outline';
import { useUser } from '@clerk/nextjs';
import { Alert, Button } from '@ragenai/common-ui';
import { useTranslations } from 'next-intl';

import { useNewThread } from '@/app/hooks/useNewThread';
import { useOnboardingContext } from '@/app/hooks/useOnboardingContext';
import { useSettings } from '@/app/hooks/useSettings';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';

import { OnboardingSteps } from './OnboardingSteps';
import { ValidationBoard } from './ValidationBoard';
import { SearchThreads } from '../SearchThreads';
import { useModalWithEscapeAndOutsideClick } from '@/app/hooks/useModalWithEscapeAndOutsideClick';

export const Start = () => {
  const { isSignedIn, isLoaded: isUserDataLoaded } = useUser();
  const t = useTranslations('Index');
  const { handleNewThread, isLoading, isPending, isLimitLock } = useNewThread();
  const { runJoyride, showOnboarding } = useOnboardingContext();
  const { hasApiKey, belongsToOrganization, hasKnowledge } = useSettings();
  const { isSearchOpen, closeSearch } = useSearchThreads();

  const shouldShowValidationBoard =
    isSignedIn &&
    !showOnboarding &&
    (!hasApiKey || !hasKnowledge || !belongsToOrganization);
  const { modalRef } = useModalWithEscapeAndOutsideClick<HTMLDivElement>();

  return (
    <>
      {isSearchOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          onClick={closeSearch}
        >
          <SearchThreads ref={modalRef} />
        </div>
      )}

      {isUserDataLoaded && (
        <div className="container mx-auto h-full">
          <div className="flex flex-col h-full items-center justify-center">
            <OnboardingSteps />
            {shouldShowValidationBoard ? (
              <ValidationBoard />
            ) : !isPending && showOnboarding ? (
              <Button
                label={t('start-tour')}
                onClick={runJoyride}
                className="start-button px-5 py-3 sm:mb-12 mb-8 tracking-wide"
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
      )}
    </>
  );
};
