'use client';

import { useUser } from '@/app/hooks/use-auth';
import { Alert } from '@ragenai/common-ui/Alert';
import { useTranslations } from 'next-intl';

import { useNewThread } from '@/app/hooks/useNewThread';
import { ChatInterface } from '../ChatInterface';

export const Start = () => {
  const { isSignedIn } = useUser();
  const t = useTranslations('Index');
  const { isLimitLock } = useNewThread();

  return (
    <>
      <div className="container mx-auto w-full">
        <div className="flex flex-col items-center justify-center w-full min-h-[calc(100vh-8rem)]">
          <ChatInterface />
          {isLimitLock && !isSignedIn && (
            <div className="mt-6">
              <Alert title={t('limit-reached')} type="info" />
            </div>
          )}
        </div>
      </div>
    </>
  );
};
