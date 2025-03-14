'use client';

import {
  useEffect,
  useTransition,
  useReducer,
  useCallback,
  useState,
} from 'react';
import { useUser, useOrganization } from '@clerk/nextjs';
import { usePathname, useRouter } from '@/i18n/routing';
import { ThreadHistoryResponse } from '@/app/contracts/Message';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addThread } from '@/store/threads/threadsSlice';
import { setProjects } from '@/store/sidebar/sidebarSlice';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';

import { checkVisitorVisits } from '../lib/services/api';
import { LOCAL_STORAGE_THREAD_KEY } from '../components/config';
import { dailyMessageLimit } from '../config';
import { useCloseThread } from './useCloseThreads';
import { statusToast } from '../lib/utils/toast';
import { trackThreadCreated } from '../actions';
import {
  createGuestThreadAction,
  createThreadAction,
} from '../lib/actions/threads';
import { getVisitorIdFromBrowserCookie } from '../lib/services/cookies.browser';

type ActionType =
  | { type: 'SET_IS_LOADING'; payload: boolean }
  | { type: 'SET_IS_LIMIT_LOCK'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

type StateType = {
  isLoading: boolean;
  isLimitLock: boolean;
  error: string | null;
};

const initialState: StateType = {
  isLoading: false,
  isLimitLock: false,
  error: null,
};

const reducer = (state: StateType, action: ActionType): StateType => {
  switch (action.type) {
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_IS_LIMIT_LOCK':
      return { ...state, isLimitLock: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export const useNewThread = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [visitorId, setVisitorId] = useState('');
  const [isPending, setTransition] = useTransition();

  const reduxDispatch = useAppDispatch();
  const defaultProjectId = useAppSelector(
    (state) => state.threads.defaultProjectId
  );
  const { organization } = useOrganization();
  const { user } = useUser();
  const { push } = useRouter();
  const pathname = usePathname();
  const { handleCloseThread } = useCloseThread();
  const { errorToast } = statusToast();

  useEffect(() => {
    const visitorCookieValue = getVisitorIdFromBrowserCookie();
    if (visitorCookieValue) {
      setVisitorId(visitorCookieValue);
    }
  }, []);

  const loadVisitorMessages = useCallback(async () => {
    if (!visitorId) {
      return;
    }
    if (pathname.includes('/threads') || pathname.includes('/projects')) {
      return;
    }

    try {
      const localStorageThreadId = localStorage.getItem(
        LOCAL_STORAGE_THREAD_KEY
      );

      if (!user) {
        const visitorMessagesResponse = await checkVisitorVisits(visitorId);

        if (visitorMessagesResponse.data.messages >= dailyMessageLimit) {
          dispatch({ type: 'SET_IS_LIMIT_LOCK', payload: true });
        }
      }

      if (
        localStorageThreadId &&
        !pathname.includes('/threads') &&
        !pathname.includes('/projects')
      ) {
        push(`/threads/${localStorageThreadId}`);
      }
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: 'Failed to load visitor messages.',
      });
    }
  }, [visitorId, pathname]);

  useEffect(() => {
    loadVisitorMessages();
  }, [loadVisitorMessages]);

  useEffect(() => {
    try {
      if (!pathname.includes('/threads') && !pathname.includes('/projects')) {
        localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to clear thread data.' });
    }
  }, [pathname]);

  const handleNewThread = async (
    initialMessage?: string,
    projectId?: number,
    projectPublicId?: string
  ) => {
    dispatch({ type: 'SET_IS_LOADING', payload: true });

    if (state.isLimitLock) {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
      return;
    }

    handleCloseThread(false);

    try {
      const result = user
        ? await createThreadAction(projectId)
        : await createGuestThreadAction();

      if (result.success) {
        trackThreadCreated();
        const threadId = result.thread.public_id;
        localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);

        if (user) {
          // Add thread to store immediately for logged in users
          const newThread: ThreadHistoryResponse = {
            public_id: threadId,
            project_id: result.thread.project_id,
            messages: initialMessage
              ? [
                  {
                    content: initialMessage,
                    created_at: new Date(),
                    role: 'USER' as const,
                    message_type: 'TEXT' as const,
                  },
                ]
              : [],
            created_at: new Date(),
          };

          //this hook logic is reused for global and project-scoped threads
          //for threads connected to the default project id redux threads.userThreads state must be updated
          //for the other projects there is a separate state cell sidebar.projects
          const projectId = result.thread.project_id;
          const isDefaultProject = projectId === defaultProjectId;
          if (isDefaultProject) {
            reduxDispatch(addThread(newThread));
          }

          // Always refresh projects if we have a project context
          if (
            organization?.id &&
            user?.id &&
            (projectId || result.thread.project_id)
          ) {
            const fetchedProjects = await getProjects(organization.id, user.id);
            if (fetchedProjects.projects) {
              reduxDispatch(setProjects(fetchedProjects.projects));
            }
          }
        }

        setTransition(() => {
          const route = projectPublicId
            ? `/projects/${projectPublicId}/threads/${threadId}`
            : `/threads/${threadId}`;

          // Store the initial message in localStorage to be picked up by the thread view
          if (initialMessage) {
            localStorage.setItem(
              `thread_${threadId}_initial_message`,
              initialMessage
            );
          }

          push(route);
        });
      }
    } catch (err) {
      errorToast({ message: 'Failed to create new thread.' });
    } finally {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
    }
  };

  return {
    handleNewThread,
    isLoading: state.isLoading,
    isPending,
    isLimitLock: state.isLimitLock,
    error: state.error,
  };
};
