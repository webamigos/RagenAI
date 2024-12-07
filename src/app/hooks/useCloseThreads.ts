import { useLocale } from 'next-intl';

import { useRouter } from '@/i18n/routing';

import { LOCAL_STORAGE_THREAD_KEY } from '../components/config';

export const useCloseThread = () => {
  const { push } = useRouter();
  const locale = useLocale();

  const handleCloseThread = (redirect: boolean) => {
    const existingThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);

    if (existingThreadId) {
      localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
      redirect && push(`/${locale}`);
    }
  };

  return { handleCloseThread };
};
