'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronRightIcon } from '@heroicons/react/24/outline';

import { Button } from '@salesyy/common-ui';

import { createThread } from '../../lib/services/api';
import { LOCAL_STORAGE_THREAD_KEY } from '../config';

export const Start = () => {
  const [isLoading, setIsLoading] = useState(false);
  const locale = useLocale();
  const { push } = useRouter();
  const t = useTranslations('Index');

  useEffect(() => {
    const localStorageThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
    if (localStorageThreadId) {
      push(`/${locale}/threads/${localStorageThreadId}`);
    }
  }, []);

  const handleNewThread = async () => {
    try {
      setIsLoading(true);
      const result = await createThread();
      const threadId = result.data.public_id;
      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
      push(`/${locale}/threads/${threadId}`);
      setIsLoading(false);
    } catch {
      // TODO: implement
    }
  };

  return (
    <div className="container mx-auto">
      <div className="mt-6 flex flex-col items-center">
        <Button
          label={t('start-new-thread')}
          className="bg-salesyy-red hover:bg-red-700 disabled:bg-red-400"
          onClick={handleNewThread}
          disabled={isLoading}
          iconRight={
            <ChevronRightIcon
              className="h-5 w-5 flex-none text-white cursor-pointer"
              aria-hidden="true"
            />
          }
        />
      </div>
    </div>
  );
};
