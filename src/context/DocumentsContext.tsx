import {
  createContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { useUser } from '@clerk/nextjs';

import { getUserDocuments } from '@/app/actions';
import { usersDocuments } from '@/app/contracts/Documents';

type DocumentsContextType = {
  documents: usersDocuments[] | null;
  refreshDocuments: () => void;
  isLoading: boolean;
  isError: boolean;
};

type Props = {
  children: React.ReactNode;
};

export const DocumentsContext = createContext<DocumentsContextType | undefined>(
  undefined
);

export const DocumentsProvider = ({ children }: Props) => {
  const [documents, setDocuments] = useState<usersDocuments[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);

  const { user } = useUser();
  const visitorId = (user?.publicMetadata.visitorId as string) || undefined;

  useEffect(() => {
    if (visitorId) {
      refreshDocuments();
    } else {
      setIsLoading(false);
    }
  }, [visitorId]);

  const refreshDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!visitorId) {
        return;
      }

      const { documentDetails } = await getUserDocuments(visitorId);
      setDocuments(documentDetails ?? null);
      setIsError(false);
    } catch (error) {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [visitorId]);

  const value = useMemo(
    () => ({
      documents,
      refreshDocuments,
      isLoading,
      isError,
    }),
    [documents, isLoading, isError, refreshDocuments]
  );

  return (
    <DocumentsContext.Provider value={value}>
      {children}
    </DocumentsContext.Provider>
  );
};
