import { createContext, useReducer, useEffect } from 'react';
import { getUserFiles } from '@/app/actions';
import { type UserFileType } from '@/app/contracts/Documents';
import { UserFile } from '@/generated/prisma/browser';

type State = {
  files: UserFileType[];
  isLoading: boolean;
  isError: boolean;
};

type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; payload: UserFileType[] }
  | { type: 'LOAD_ERROR' }
  | { type: 'ADD_FILE'; payload: UserFileType }
  | { type: 'REMOVE_FILE'; payload: string };

const initialState: State = {
  files: [],
  isLoading: true,
  isError: false,
};

function filesReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true, isError: false };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        isLoading: false,
        isError: false,
        files: action.payload,
      };
    case 'LOAD_ERROR':
      return { ...state, isLoading: false, isError: true };
    case 'ADD_FILE':
      return { ...state, files: [...state.files, action.payload] };
    case 'REMOVE_FILE':
      return {
        ...state,
        files: state.files.filter((file) => file.public_id !== action.payload),
      };
    default:
      return state;
  }
}

type FilesContextType = {
  files: UserFileType[];
  refreshFiles: () => void;
  addFile: (newFile: UserFileType) => void;
  removeFile: (filePublicId: UserFile['public_id']) => void;
  isLoading: boolean;
  isError: boolean;
};

type Props = {
  children: React.ReactNode;
};

export const FilesContext = createContext<FilesContextType | undefined>(
  undefined
);

export const FilesProvider = ({ children }: Props) => {
  const [state, dispatch] = useReducer(filesReducer, initialState);

  const refreshFiles = async () => {
    dispatch({ type: 'LOAD_START' });
    try {
      const { files } = await getUserFiles();
      dispatch({ type: 'LOAD_SUCCESS', payload: files ?? [] });
    } catch (error) {
      dispatch({ type: 'LOAD_ERROR' });
    }
  };

  useEffect(() => {
    refreshFiles();
  }, []);

  const addFile = (newFile: Omit<UserFileType, 'public_id' | 'document'>) => {
    dispatch({ type: 'ADD_FILE', payload: newFile as UserFileType }); // TODO: quick fix it will be refactored
  };

  const removeFile = (publicFileId: UserFile['public_id']) => {
    dispatch({ type: 'REMOVE_FILE', payload: publicFileId });
  };

  const value = {
    files: state.files,
    refreshFiles,
    addFile,
    removeFile,
    isLoading: state.isLoading,
    isError: state.isError,
  };

  return (
    <FilesContext.Provider value={value}>{children}</FilesContext.Provider>
  );
};
