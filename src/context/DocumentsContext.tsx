import { createContext, useState, useMemo, useEffect } from 'react';
import { useUser, useOrganization } from '@clerk/nextjs';

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

  // const { user } = useUser();
  const { organization } = useOrganization();

  const orgId = organization?.id.toLowerCase();

  useEffect(() => {
    if (orgId) {
      refreshDocuments();
    } else {
      setIsLoading(false);
    }
  }, [orgId]);

  const refreshDocuments = async () => {
    setIsLoading(true);
    try {
      if (!orgId) {
        return;
      }

      const { documentDetails } = await getUserDocuments(orgId);
      setDocuments(documentDetails ?? null);
      setIsError(false);
    } catch (error) {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    documents,
    refreshDocuments,
    isLoading,
    isError,
  };

  return (
    <DocumentsContext.Provider value={value}>
      {children}
    </DocumentsContext.Provider>
  );
};
