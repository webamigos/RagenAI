'use client';

import { useTranslations } from 'next-intl';
import { RocketLaunchIcon } from '@heroicons/react/24/outline';
import { useUser } from '@clerk/nextjs';
import { Alert, Button } from '@salesyy/common-ui';
import { useNewThread } from '@/app/hooks/useNewThread';

export const Start = () => {
  const { isSignedIn } = useUser();
  const t = useTranslations('Index');
  const { handleNewThread, isLoading, isPending, isLimitLock } = useNewThread();

  return (
    <div className="container mx-auto h-full">
      <div className="flex flex-col h-full items-center justify-center">
        {!isPending && (
          <Button
            label={t('start-new-thread')}
            className="px-5 py-3 sm:mb-12 mb-8"
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
