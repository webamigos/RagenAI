'use client';

import {
  useEffect,
  useTransition,
  useReducer,
  useCallback,
  useState,
} from 'react';
import { useUser, useOrganization, useAuth } from '@/app/hooks/use-auth';
import { usePathname, useRouter } from '@/i18n/routing';
import { type ThreadHistoryResponse } from '@/features/threads/contracts/thread.types';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addThread } from '@/store/threads/threadsSlice';
import { setProjects, addThreadToProject } from '@/store/sidebar/sidebarSlice';
import { clearMessages } from '@/store/assistant/assistantSlice';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';

import { checkVisitorVisits } from '../lib/services/api';
import { LOCAL_STORAGE_THREAD_KEY } from '../components/config';
import { dailyMessageLimit } from '../config';
import { useCloseThread } from './useCloseThreads';
import { statusToast } from '../lib/utils/toast';
import { trackThreadCreated } from '../actions';
import { createThreadAction } from '@/features/threads/services/commands/create-thread-command';
import { createGuestThreadCommand as createGuestThreadAction } from '@/features/threads/services/commands/create-guest-thread-command';
import { getVisitorIdFromBrowserCookie } from '../lib/services/cookies.browser';
import { sidebarThreadEvents } from '../components/Sidebar/NewSidebar/useSidebarThreads';

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
  const [isPending, startTransition] = useTransition();

  const reduxDispatch = useAppDispatch();
  const defaultProjectPublicId = useAppSelector(
    (state) => state.threads.defaultProjectPublicId,
  );
  const { organization } = useOrganization();
  const { user } = useUser();
  const { orgId: sessionOrgId } = useAuth(); // Get orgId from session.activeOrganizationId
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
    if (pathname.includes('/chats') || pathname.includes('/projects')) {
      return;
    }

    try {
      const localStorageThreadId = localStorage.getItem(
        LOCAL_STORAGE_THREAD_KEY,
      );

      if (!user) {
        const visitorMessagesResponse = await checkVisitorVisits(visitorId);

        if (visitorMessagesResponse.data.messages >= dailyMessageLimit) {
          dispatch({ type: 'SET_IS_LIMIT_LOCK', payload: true });
        }
      }

      if (
        localStorageThreadId &&
        !pathname.includes('/chats') &&
        !pathname.includes('/projects')
      ) {
        push(`/chats/${localStorageThreadId}`);
      }
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: 'Failed to load visitor messages.',
      });
    }
  }, [visitorId, pathname, push, user]);

  useEffect(() => {
    loadVisitorMessages();
  }, [loadVisitorMessages]);

  useEffect(() => {
    try {
      if (!pathname.includes('/chats') && !pathname.includes('/projects')) {
        localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to clear thread data.' });
    }
  }, [pathname]);

  const handleNewThread = async (
    initialMessage?: string,
    projectId?: number,
    projectPublicId?: string,
    mentionedProjectId?: number,
    preferredModel?: string,
    threadDocuments?: ThreadDocumentUI[],
  ) => {
    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });
      handleCloseThread(false);
      reduxDispatch(clearMessages());

      // Get orgId from organization hook or session.activeOrganizationId
      // (activeOrganizationId is set by finalizeUserOnboarding during login/registration)
      const orgId = organization?.id || sessionOrgId;

      const result =
        user && orgId
          ? await createThreadAction(
              orgId,
              user.id,
              projectId,
              mentionedProjectId,
              preferredModel,
              threadDocuments,
            )
          : await createGuestThreadAction({
              mentionedProjectId,
              preferredModel,
            });

      if (result.success) {
        await trackThreadCreated();
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
                    created_at: new Date().toISOString(),
                    role: 'USER' as const,
                    message_type: 'TEXT' as const,
                  },
                ]
              : [],
            created_at: new Date().toISOString(),
          };

          //this hook logic is reused for global and project-scoped threads
          //for threads connected to the default project id redux threads.userThreads state must be updated
          //for the other projects there is a separate state cell sidebar.projects
          const isDefaultProject =
            !projectPublicId || projectPublicId === defaultProjectPublicId;
          if (isDefaultProject) {
            reduxDispatch(addThread(newThread));

            if (organization?.id && user?.id) {
              const fetchedProjects = await getProjects(
                organization.id,
                user.id,
              );
              if (fetchedProjects.projects) {
                reduxDispatch(setProjects(fetchedProjects.projects));
              }
            }
          } else if (result.thread.project_id != null) {
            const threadForProject = {
              created_at: new Date().toISOString(),
              public_id: threadId,
              visitor_id: user.id,
              preferred_communication_type: 'TEXT' as const,
              project_id: result.thread.project_id,
              messages: initialMessage ? [{ content: initialMessage }] : [],
            };
            reduxDispatch(
              addThreadToProject({
                projectId: result.thread.project_id,
                thread: threadForProject,
              }),
            );
          }
        }

        // Notify sidebar about the new thread
        if (user) {
          sidebarThreadEvents.emit({
            type: 'thread-created',
            thread: {
              public_id: threadId,
              created_at: new Date().toISOString(),
              is_starred: false,
              title: null,
              project_id: result.thread.project_id ?? null,
              project: null,
              messages: initialMessage ? [{ content: initialMessage }] : [],
            },
          });
        }

        startTransition(() => {
          const route = `/chats/${threadId}`;

          // Store the initial message in localStorage to be picked up by the thread view
          if (initialMessage) {
            localStorage.setItem(
              `thread_${threadId}_initial_message`,
              initialMessage,
            );
          }

          // Store thread documents so the initial message can include them
          if (threadDocuments && threadDocuments.length > 0) {
            try {
              sessionStorage.setItem(
                `thread_${threadId}_initial_documents`,
                JSON.stringify(threadDocuments),
              );
            } catch {
              // sessionStorage may be full for large files — documents will still
              // be loaded from DB once async processing completes
            }
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
