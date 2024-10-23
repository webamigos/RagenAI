import { useRouter } from 'next/navigation';
import { MouseEvent, useEffect, useState, useTransition } from 'react';
import { useUser } from '@clerk/nextjs';
import {
  checkVisitorVisits,
  createThread,
  createThreadForGuest,
} from '../lib/services/api';
import { loadFingerprint } from '../lib/utils/fingerprint';
import { LOCAL_STORAGE_THREAD_KEY } from '../components/config';
import { dailyMessageLimit } from '../config';
import { useLocale } from 'next-intl';
import { useCloseThread } from './useCloseThreads';

export const useNewThread = () => {
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, setTransition] = useTransition();
  const [isLimitLock, setIsLimitLock] = useState(false);

  const { isSignedIn, user } = useUser();
  const { push } = useRouter();
  const locale = useLocale();
  const { handleCloseThread } = useCloseThread();

  useEffect(() => {
    const setId = async () => {
      if (isSignedIn && user?.publicMetadata?.visitorId) {
        setVisitorId(user?.publicMetadata?.visitorId as string);
      } else {
        const fingerprintId = await loadFingerprint();
        setVisitorId(fingerprintId);
      }
    };

    setId();
  }, [isSignedIn, user]);

  useEffect(() => {
    if (!visitorId) return;

    const loadVisitorMessages = async () => {
      const localStorageThreadId = localStorage.getItem(
        LOCAL_STORAGE_THREAD_KEY
      );

      const visitorMessagesResponse = await checkVisitorVisits(visitorId);

      if (visitorMessagesResponse.data.messages >= dailyMessageLimit) {
        setIsLimitLock(true);
      }

      if (localStorageThreadId) {
        push(`/${locale}/threads/${localStorageThreadId}`);
      }
    };
    loadVisitorMessages();
  }, [visitorId]);

  const handleNewThread = async () => {
    try {
      setIsLoading(true);
      if (!isLimitLock) {
        handleCloseThread(false);

        const result = user
          ? await createThread()
          : await createThreadForGuest();

        const threadId = result.data.public_id;
        localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);

        user
          ? setTransition(() => push(`/${locale}/threads/${threadId}`))
          : setTransition(() => push(`/${locale}/guest-threads/${threadId}`));
        setIsLoading(false);
      }
    } catch {
      // TODO: Handle error
    }
  };

  return { handleNewThread, isLoading, isPending, isLimitLock };
};
