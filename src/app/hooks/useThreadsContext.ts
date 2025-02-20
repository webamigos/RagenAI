import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  setUserThreads,
  addThread,
  addThreads,
  setLoading,
  setError,
} from '@/store/features/threads/threadsSlice';

export const useThreadsContext = () => {
  const dispatch = useAppDispatch();
  const state = useAppSelector((state) => state.threads);

  return {
    dispatch: {
      setUserThreads: (threads: any[]) => dispatch(setUserThreads(threads)),
      addThread: (thread: any) => dispatch(addThread(thread)),
      addThreads: (threads: any[]) => dispatch(addThreads(threads)),
      setLoading: (loading: boolean) => dispatch(setLoading(loading)),
      setError: (error: any) => dispatch(setError(error)),
    },
    state: {
      userThreads: state.userThreads,
      isLoading: state.isLoading,
      error: state.error,
    },
  };
};
