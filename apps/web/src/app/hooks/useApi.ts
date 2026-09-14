import { useEffect, useRef, useState } from 'react';

type S<T> =
  | {
      // pending
      error: undefined;
      data: undefined;
      isLoading: true;
      isError: false;
      isSuccess: false;
    }
  | {
      // resolved
      error: undefined;
      data: T;
      isLoading: false;
      isError: false;
      isSuccess: true;
    }
  | {
      // rejected
      error: unknown;
      data: undefined;
      isLoading: false;
      isError: true;
      isSuccess: false;
    };

//

export const useApi = <T>(fetcher: () => Promise<T>) => {
  const mounted = useRef(false);
  const requestId = useRef(0);
  const [state, setState] = useState<S<T>>({
    error: undefined,
    data: undefined,
    isLoading: true,
    isError: false,
    isSuccess: false,
  });
  const loadData = async () => {
    if (!mounted.current) {
      return;
    }
    const currentRequest = ++requestId.current;
    try {
      const response = await fetcher();
      if (!mounted.current || currentRequest !== requestId.current) {
        return;
      }
      setState({
        data: response,
        error: undefined,
        isLoading: false,
        isError: false,
        isSuccess: true,
      });
    } catch (error) {
      if (!mounted.current || currentRequest !== requestId.current) {
        return;
      }
      setState({
        data: undefined,
        error,
        isLoading: false,
        isError: true,
        isSuccess: false,
      });
    }
  };

  useEffect(() => {
    mounted.current = true;
    void loadData();
    return () => {
      mounted.current = false;
    };
    // Callers pass inline fetchers. Preserve mount-only loading; refetch uses current props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetch = () => {
    if (!mounted.current) {
      return;
    }
    setState({
      data: undefined,
      error: undefined,
      isLoading: true,
      isError: false,
      isSuccess: false,
    });
    void loadData();
  };

  return { ...state, refetch };
};
