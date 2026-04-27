import { createContext, useReducer, useCallback } from 'react';
import type { UserFileType } from '@/features/documents/contracts/document.types';
import type { UserFile } from '@/generated/prisma/browser';

export type KbViewMode = 'all' | 'my-files' | 'shared-with-me';

type State = {
  currentFolderId: string | null;
  viewMode: KbViewMode;
};

type Action =
  | { type: 'SET_FOLDER'; payload: string | null }
  | { type: 'SET_VIEW_MODE'; payload: KbViewMode };

const initialState: State = {
  currentFolderId: null,
  viewMode: 'all',
};

function filesReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_FOLDER':
      return { ...state, currentFolderId: action.payload };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    default:
      return state;
  }
}

type FilesContextType = {
  currentFolderId: string | null;
  viewMode: KbViewMode;
  setFolder: (folderId: string | null) => void;
  setViewMode: (mode: KbViewMode) => void;
  addFile: (newFile: UserFileType) => void;
  removeFile: (fileId: UserFile['id']) => void;
};

type Props = {
  children: React.ReactNode;
};

export const FilesContext = createContext<FilesContextType | undefined>(
  undefined,
);

export const FilesProvider = ({ children }: Props) => {
  const [state, dispatch] = useReducer(filesReducer, initialState);

  const setFolder = useCallback((folderId: string | null) => {
    dispatch({ type: 'SET_FOLDER', payload: folderId });
  }, []);

  const setViewMode = useCallback((mode: KbViewMode) => {
    dispatch({ type: 'SET_VIEW_MODE', payload: mode });
  }, []);

  // No-ops: actual list refresh happens via router.refresh() → server re-render
  const addFile = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_newFile: UserFileType) => {},
    [],
  );
  const removeFile = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_fileId: UserFile['id']) => {},
    [],
  );

  return (
    <FilesContext.Provider
      value={{
        currentFolderId: state.currentFolderId,
        viewMode: state.viewMode,
        setFolder,
        setViewMode,
        addFile,
        removeFile,
      }}
    >
      {children}
    </FilesContext.Provider>
  );
};
