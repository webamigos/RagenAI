import { createContext, useReducer, useEffect, useCallback } from 'react';
import { getUserFiles } from '@/app/actions';
import { type UserFileType } from '@/features/documents/contracts/document.types';
import { type UserFile } from '@/generated/prisma/browser';
import { NOTIFICATIONS_DEFAULT_CHANNEL } from '@/app/lib/services/notifications/config';
import { getPusherClient } from '@/app/lib/services/notifications/pusher-client';
import {
  NotificationEvent,
  type NotificationMessage,
} from '@/app/lib/services/notifications/types';

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
      return { ...state, files: [action.payload, ...state.files] };
    case 'REMOVE_FILE':
      return {
        ...state,
        files: state.files.filter((file) => file.publicId !== action.payload),
      };
    default:
      return state;
  }
}

type FilesContextType = {
  files: UserFileType[];
  refreshFiles: () => void;
  addFile: (newFile: UserFileType) => void;
  removeFile: (filePublicId: UserFile['publicId']) => void;
  isLoading: boolean;
  isError: boolean;
};

type Props = {
  children: React.ReactNode;
};

export const FilesContext = createContext<FilesContextType | undefined>(
  undefined,
);

export const FilesProvider = ({ children }: Props) => {
  const [state, dispatch] = useReducer(filesReducer, initialState);

  const refreshFiles = useCallback(async () => {
    dispatch({ type: 'LOAD_START' });
    try {
      const { files } = await getUserFiles();
      dispatch({ type: 'LOAD_SUCCESS', payload: files ?? [] });
    } catch (error) {
      dispatch({ type: 'LOAD_ERROR' });
    }
  }, []);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  // Auto-refresh file list when worker sends a forceRefresh notification
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(NOTIFICATIONS_DEFAULT_CHANNEL);

    const handleNotification = (notification: NotificationMessage) => {
      if (notification.meta?.forceRefresh) {
        refreshFiles();
      }
    };

    channel.bind(NotificationEvent.SUCCESS_EVENT, handleNotification);

    return () => {
      channel.unbind(NotificationEvent.SUCCESS_EVENT, handleNotification);
    };
  }, [refreshFiles]);

  const addFile = (newFile: UserFileType) => {
    dispatch({ type: 'ADD_FILE', payload: newFile });
  };

  const removeFile = (publicFileId: UserFile['publicId']) => {
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
