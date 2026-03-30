import {
  createContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { getUserFiles } from '@/app/actions';
import { getFolders } from '@/app/actions/folders';
import {
  type UserFileType,
  type DocumentFolderItem,
} from '@/features/documents/contracts/document.types';
import { type UserFile } from '@/generated/prisma/browser';
import { subscribeNotification } from '@/app/lib/services/notifications/notification-client';
import {
  NotificationEvent,
  type NotificationMessage,
} from '@/app/lib/services/notifications/types';

export type KbViewMode = 'all' | 'my-files' | 'shared-with-me';

type State = {
  files: UserFileType[];
  subfolders: DocumentFolderItem[];
  isLoading: boolean;
  isError: boolean;
  currentFolderId: number | null;
  viewMode: KbViewMode;
};

type Action =
  | { type: 'LOAD_START' }
  | {
      type: 'LOAD_SUCCESS';
      payload: { files: UserFileType[]; subfolders: DocumentFolderItem[] };
    }
  | { type: 'LOAD_ERROR' }
  | { type: 'ADD_FILE'; payload: UserFileType }
  | { type: 'REMOVE_FILE'; payload: string }
  | { type: 'SET_FOLDER'; payload: number | null }
  | { type: 'SET_VIEW_MODE'; payload: KbViewMode };

const initialState: State = {
  files: [],
  subfolders: [],
  isLoading: true,
  isError: false,
  currentFolderId: null,
  viewMode: 'all',
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
        files: action.payload.files,
        subfolders: action.payload.subfolders,
      };
    case 'LOAD_ERROR':
      return { ...state, isLoading: false, isError: true };
    case 'ADD_FILE':
      return { ...state, files: [action.payload, ...state.files] };
    case 'REMOVE_FILE':
      return {
        ...state,
        files: state.files.filter((file) => file.publicId !== action.payload),
      };
    case 'SET_FOLDER':
      return { ...state, currentFolderId: action.payload };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    default:
      return state;
  }
}

type FilesContextType = {
  files: UserFileType[];
  subfolders: DocumentFolderItem[];
  refreshFiles: () => void;
  addFile: (newFile: UserFileType) => void;
  removeFile: (filePublicId: UserFile['publicId']) => void;
  isLoading: boolean;
  isError: boolean;
  currentFolderId: number | null;
  viewMode: KbViewMode;
  setFolder: (folderId: number | null) => void;
  setViewMode: (mode: KbViewMode) => void;
};

type Props = {
  children: React.ReactNode;
};

export const FilesContext = createContext<FilesContextType | undefined>(
  undefined,
);

export const FilesProvider = ({ children }: Props) => {
  const [state, dispatch] = useReducer(filesReducer, initialState);
  const isRefreshingRef = useRef(false);

  const refreshFiles = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }
    isRefreshingRef.current = true;
    dispatch({ type: 'LOAD_START' });
    try {
      const [{ files }, allFolders] = await Promise.all([
        getUserFiles({
          folderId: state.currentFolderId,
          viewMode: state.viewMode,
        }),
        getFolders(),
      ]);

      // Filter to subfolders of the current folder
      let subfolders: typeof allFolders = [];
      if (state.viewMode === 'shared-with-me') {
        // Don't show folder tree in "Shared with me" — only explicitly shared files
        subfolders = [];
      } else if (state.viewMode === 'my-files') {
        // Show user's own folders at current level
        subfolders = allFolders.filter(
          (f) => f.parentId === state.currentFolderId && f.ownerId !== null,
        );
      } else {
        subfolders = allFolders.filter(
          (f) => f.parentId === state.currentFolderId,
        );
      }

      dispatch({
        type: 'LOAD_SUCCESS',
        payload: { files: files ?? [], subfolders },
      });
    } catch (error) {
      dispatch({ type: 'LOAD_ERROR' });
    } finally {
      isRefreshingRef.current = false;
    }
  }, [state.currentFolderId, state.viewMode]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  // Auto-refresh file list when worker sends a forceRefresh notification
  useEffect(() => {
    const unsubscribe = subscribeNotification(
      NotificationEvent.SUCCESS_EVENT,
      (notification: NotificationMessage) => {
        if (notification.meta?.forceRefresh) {
          refreshFiles();
        }
      },
    );

    return unsubscribe;
  }, [refreshFiles]);

  const addFile = (newFile: UserFileType) => {
    dispatch({ type: 'ADD_FILE', payload: newFile });
  };

  const removeFile = (publicFileId: UserFile['publicId']) => {
    dispatch({ type: 'REMOVE_FILE', payload: publicFileId });
  };

  const setFolder = useCallback((folderId: number | null) => {
    dispatch({ type: 'SET_FOLDER', payload: folderId });
  }, []);

  const setViewMode = useCallback((mode: KbViewMode) => {
    dispatch({ type: 'SET_VIEW_MODE', payload: mode });
  }, []);

  const value = {
    files: state.files,
    subfolders: state.subfolders,
    refreshFiles,
    addFile,
    removeFile,
    isLoading: state.isLoading,
    isError: state.isError,
    currentFolderId: state.currentFolderId,
    viewMode: state.viewMode,
    setFolder,
    setViewMode,
  };

  return (
    <FilesContext.Provider value={value}>{children}</FilesContext.Provider>
  );
};
