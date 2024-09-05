import { useEffect, useState } from 'react';

type S<T> =
  | {
      // pending
      data: undefined;
      isLoading: true;
      isError: false;
      isSuccess: false;
    }
  | {
      // resolved
      data: T;
      isLoading: false;
      isError: false;
      isSuccess: true;
    }
  | {
      // rejected
      data: undefined;
      isLoading: false;
      isError: true;
      isSuccess: false;
    };

//

export const useApi = <T>(fetcher: () => Promise<T>) => {
  const [state, setState] = useState<S<T>>({
    data: undefined,
    isLoading: true,
    isError: false,
    isSuccess: false,
  });
  const { data, isLoading, isError, isSuccess } = state;

  const loadData = async () => {
    try {
      const response = await fetcher();

      setState({
        data: response,
        isLoading: false,
        isError: false,
        isSuccess: true,
      });
    } catch (e) {
      // error
      setState({
        data: undefined,
        isLoading: false,
        isError: true,
        isSuccess: false,
      });
    }
  };

  // TODO: cancelation
  useEffect(() => {
    loadData();
  }, []);

  const refetch = () => {
    loadData();
  };

  return { data, isLoading, isError, isSuccess, refetch };
};
