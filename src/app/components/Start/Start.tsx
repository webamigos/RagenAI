'use client';

import { useUser } from '@clerk/nextjs';
import { Alert, Button } from '@ragenai/common-ui';
import { useTranslations } from 'next-intl';

import { useNewThread } from '@/app/hooks/useNewThread';
import { useOnboardingContext } from '@/app/hooks/useOnboardingContext';
import { useSettings } from '@/app/hooks/useSettings';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';

import { OnboardingSteps } from './OnboardingSteps';
import { ValidationBoard } from './ValidationBoard';
import { SearchThreads } from '../Sidebar/ThreadsHistory/SearchThreads';
import { useModalWithEscapeAndOutsideClick } from '@/app/hooks/useModalWithEscapeAndOutsideClick';
import { NewChatInterface } from '../NewChatInterface';

export const Start = () => {
  const { isSignedIn, isLoaded: isUserDataLoaded, user } = useUser();
  const t = useTranslations('Index');
  const { isPending, isLimitLock } = useNewThread();
  const { runJoyride, showOnboarding } = useOnboardingContext();
  const { hasApiKey, belongsToOrganization, hasKnowledge } = useSettings();
  const { isSearchOpen, closeSearch } = useSearchThreads();
  const { modalRef } = useModalWithEscapeAndOutsideClick<HTMLDivElement>();

  const shouldShowValidationBoard =
    isSignedIn &&
    !showOnboarding &&
    (!hasApiKey || !hasKnowledge || !belongsToOrganization);
  const userId = user?.id;
  return (
    <>
      {isSearchOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          onClick={closeSearch}
        >
          <SearchThreads visitorId={userId!} ref={modalRef} />
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
              <NewChatInterface />
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
