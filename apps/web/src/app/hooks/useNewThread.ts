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
import { trackThreadCreatedCommand as trackThreadCreated } from '@/features/threads/services/commands/track-thread-created-command';
import { createThreadAction } from '@/features/threads/services/commands/create-thread-command';
import type { KnowledgeScope } from '@ragenai/platform-contracts';
import { createGuestThreadCommand as createGuestThreadAction } from '@/features/threads/services/commands/create-guest-thread-command';
import { getVisitorIdFromBrowserCookie } from '../lib/services/cookies.browser';
import { sidebarThreadEvents } from '../components/Sidebar/SidebarContent/useSidebarThreads';

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
  const defaultProjectId = useAppSelector(
    (state) => state.threads.defaultProjectId,
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
    projectId?: string,
    _projectId2?: string,
    mentionedProjectId?: string,
    preferredModel?: string,
    threadDocuments?: ThreadDocumentUI[],
    knowledgeScope?: KnowledgeScope,
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
              knowledgeScope,
            )
          : await createGuestThreadAction({
              mentionedProjectId,
              preferredModel,
            });

      if (result.success) {
        await trackThreadCreated();
        const threadId = result.thread.id;
        localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);

        if (user) {
          // Add thread to store immediately for logged in users
          const newThread: ThreadHistoryResponse = {
            id: threadId,
            projectId: result.thread.projectId,
            messages: initialMessage
              ? [
                  {
                    content: initialMessage,
                    createdAt: new Date().toISOString(),
                    role: 'USER' as const,
                    messageType: 'TEXT' as const,
                  },
                ]
              : [],
            createdAt: new Date().toISOString(),
          };

          //this hook logic is reused for global and project-scoped threads
          //for threads connected to the default project id redux threads.userThreads state must be updated
          //for the other projects there is a separate state cell sidebar.projects
          const isDefaultProject = !projectId || projectId === defaultProjectId;
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
          } else if (result.thread.projectId != null) {
            const threadForProject = {
              createdAt: new Date().toISOString(),
              id: threadId,
              visitorId: user.id,
              preferredCommunicationType: 'TEXT' as const,
              projectId: result.thread.projectId,
              messages: initialMessage ? [{ content: initialMessage }] : [],
            };
            reduxDispatch(
              addThreadToProject({
                projectId: result.thread.projectId,
                thread: threadForProject,
              }),
            );
          }
        }

        // Notify sidebar about the new thread
        if (user) {
          let threadTitle: string | null = null;
          if (initialMessage) {
            threadTitle =
              initialMessage.length > 100
                ? `${initialMessage.substring(0, 100)}...`
                : initialMessage;
          }

          sidebarThreadEvents.emit({
            type: 'thread-created',
            thread: {
              id: threadId,
              createdAt: new Date().toISOString(),
              isStarred: false,
              title: threadTitle,
              projectId: result.thread.projectId ?? null,
              teamId: null,
              project: null,
              team: null,
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
