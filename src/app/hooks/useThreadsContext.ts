import { useAppDispatch, useAppSelector } from '@/store/hooks';

export const useThreadsContext = () => {
  const dispatch = useAppDispatch();
  const state = useAppSelector((state) => state.threads);

  return {
    dispatch,
    state,
  };
};
