import { useRouter } from '@/i18n/routing';

import { LOCAL_STORAGE_THREAD_KEY } from '../components/config';

export const useCloseThread = () => {
  const { push } = useRouter();

  const handleCloseThread = (redirect: boolean) => {
    const existingThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);

    if (existingThreadId) {
      localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
      redirect && push(`/`);
    }
  };

  return { handleCloseThread };
};
