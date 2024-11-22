import { createContext, useReducer, useEffect } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { getUserDocuments } from '@/app/actions';
import { type UserFileType } from '@/app/contracts/Documents';

type State = {
  documents: UserFileType[];
  isLoading: boolean;
  isError: boolean;
};

type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; payload: UserFileType[] }
  | { type: 'LOAD_ERROR' }
  | { type: 'ADD_DOCUMENT'; payload: UserFileType }
  | { type: 'REMOVE_DOCUMENT'; payload: string };

const initialState: State = {
  documents: [],
  isLoading: true,
  isError: false,
};

function documentsReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true, isError: false };
    case 'LOAD_SUCCESS':
      return { ...state, isLoading: false, documents: action.payload };
    case 'LOAD_ERROR':
      return { ...state, isLoading: false, isError: true };
    case 'ADD_DOCUMENT':
      return { ...state, documents: [...state.documents, action.payload] };
    case 'REMOVE_DOCUMENT':
      return {
        ...state,
        documents: state.documents.filter((doc) => doc.id !== action.payload),
      };
    default:
      return state;
  }
}

type DocumentsContextType = {
  documents: UserFileType[];
  refreshDocuments: () => void;
  addDocument: (newDocument: UserFileType) => void;
  removeDocument: (documentId: string) => void;
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
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const [state, dispatch] = useReducer(documentsReducer, initialState);

  const refreshDocuments = async () => {
    if (!orgId) return;

    dispatch({ type: 'LOAD_START' });
    try {
      const { documentDetails } = await getUserDocuments(orgId);
      dispatch({ type: 'LOAD_SUCCESS', payload: documentDetails ?? [] });
    } catch (error) {
      dispatch({ type: 'LOAD_ERROR' });
    }
  };

  useEffect(() => {
    if (orgId) {
      refreshDocuments();
    } else {
      dispatch({ type: 'LOAD_ERROR' });
    }
  }, [orgId]);

  const addDocument = (newDocument: UserFileType) => {
    dispatch({ type: 'ADD_DOCUMENT', payload: newDocument });
  };

  const removeDocument = (documentId: string) => {
    dispatch({ type: 'REMOVE_DOCUMENT', payload: documentId });
  };

  const value = {
    documents: state.documents,
    refreshDocuments,
    addDocument,
    removeDocument,
    isLoading: state.isLoading,
    isError: state.isError,
  };

  return (
    <DocumentsContext.Provider value={value}>
      {children}
    </DocumentsContext.Provider>
  );
};
