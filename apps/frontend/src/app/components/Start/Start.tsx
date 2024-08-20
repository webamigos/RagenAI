'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { Alert, Button } from '@salesyy/common-ui';
import { useUser } from '@clerk/nextjs';

import { checkVisitorVisits, createThread } from '../../lib/services/api';
import { LOCAL_STORAGE_THREAD_KEY } from '../config';
import { loadFingerprint } from '../../lib/utils/fingerprint';
import { dailyMessageLimit } from '../../config';

export const Start = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, setTransition] = useTransition();
  const [isLimitLock, setIsLimitLock] = useState(false);

  const { isSignedIn } = useUser();
  const locale = useLocale();
  const { push } = useRouter();
  const t = useTranslations('Index');

  useEffect(() => {
    const loadVisitorMessages = async () => {
      const localStorageThreadId = localStorage.getItem(
        LOCAL_STORAGE_THREAD_KEY
      );

      const visitorId = await loadFingerprint();
      const visitorMessagesResponse = await checkVisitorVisits(visitorId);
      if (visitorMessagesResponse.data.messages >= dailyMessageLimit) {
        setIsLimitLock(true);
      }

      if (localStorageThreadId) {
        push(`/${locale}/threads/${localStorageThreadId}`);
      }
    };
    loadVisitorMessages();
  }, []);

  const handleNewThread = async () => {
    try {
      setIsLoading(true);
      if (!isLimitLock) {
        const result = await createThread();
        const threadId = result.data.public_id;
        localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
        setTransition(() => push(`/${locale}/threads/${threadId}`));
        setIsLoading(false);
      }
    } catch {
      // TODO: implement
    }
  };

  return (
    <div className="container mx-auto h-full">
      <div className="flex flex-col h-full items-center justify-center">
        {!isPending && (
          <Button
            label={t('start-new-thread')}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 sm:mb-12 mb-8 "
            onClick={handleNewThread}
            isLoading={isLoading}
            disabled={isLoading || isLimitLock}
            iconRight={
              <ChevronRightIcon
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
