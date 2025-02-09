import {
  useReducer,
  useEffect,
  useRef,
  startTransition,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import { Role } from '@prisma/client';
import { useUser } from '@clerk/nextjs';
import { type UserResource } from '@clerk/types';

import { useRouter, usePathname } from '@/i18n/routing';
import { LOCAL_STORAGE_THREAD_KEY } from '../config';
import { dailyMessageLimit } from '../../config';
import { useApi } from '../../hooks/useApi';
import { useThreadsContext } from '../../hooks/useThreadsContext';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import {
  checkVisitorVisits,
  fetchMessagesFromApi,
} from '../../lib/services/api';
import {
  assistantReducer,
  reducerActions,
  sharedReducerActions,
  State,
} from './reducer';
import {
  ChatResponseType,
  ChatType,
  type CreateMessageDto,
} from '../../contracts/Message';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';
import { PromptFormRef } from './PromptForm/PromptForm';
import { handleAssistantStream } from './utils';
import { AssistantMode } from '@/app/contracts/Assistant';

const { SET_MODE, SET_MODE_VOICE, SET_MESSAGE_PLAYED } = reducerActions;

const { SET_INITIAL_LOAD, SET_LIMIT_LOCK, SET_MESSAGES } = sharedReducerActions;

const { errorToast } = statusToast();

export const useAssistantLogic = (threadId: string) => {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const { isSearchOpen, modalRef, closeSearch } = useSearchThreads();

  const initialState: State = {
    isInitialLoad: true,
    isMessageLoading: false,
    userMessageId: '',
    isLimitLock: false,
    messageLoadingText: '',
    isMessageError: false,
    isError: false,
    streamedMessage: null,
    messages: [],
    mode: ChatType.CONVERSATION,
    responseType: ChatResponseType.TEXT,
  };

  const userVisitorId = user?.id;
  const id = user?.id;

  const { isLoading } = useApi(() => {
    if (id) {
      return fetchMessagesFromApi(threadId, id);
    }
    return Promise.resolve(null);
  });

  const messagesEndDivRef = useRef<HTMLDivElement>(null);

  const t = useTranslations('Index');
  const tChainErrors = useTranslations('chain-errors');
  const tApiEvents = useTranslations('api-events');
  const { dispatch: threadsDispatch } = useThreadsContext();
  const isPublicAccess = pathname.includes('/public');

  const [state, dispatch] = useReducer(assistantReducer, initialState);

  const isGlobalLoading =
    !state.isError && (state.isMessageLoading || isLoading);
  const promptFormRef = useRef<PromptFormRef>(null);
  const [isRecording, setIsRecording] = useState(false);

  const scrollToBottom = () =>
    messagesEndDivRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchData = async (id: string | undefined) => {
    if (!id) {
      startTransition(() => router.push('/sign-in'));
      return;
    }

    dispatch({ type: SET_INITIAL_LOAD, payload: true });
    try {
      const response = await fetchMessagesFromApi(threadId, id);

      if (response) {
        dispatch({ type: SET_INITIAL_LOAD, payload: false });
        dispatch({ type: SET_MESSAGES, payload: response.data });
      }
    } catch (error) {
      logger.error('Error fetching messages: %o', error);
    }
  };

  useEffect(() => {
    if (isLoaded) {
      const id = userVisitorId;
      if (id) {
        fetchData(id);
      }
    }
  }, [isLoaded, userVisitorId]);

  useEffect(() => {
    const localStorageThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
    if (!localStorageThreadId) {
      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
    }
  }, [threadId]);

  useEffect(() => {
    if (state.messages.length > 0) {
      scrollToBottom();
      const id = userVisitorId;
      if (id) {
        loadVisitorMessages(id);
      }
    }
  }, [state.messages, userVisitorId]);

  const loadVisitorMessages = async (id: string) => {
    try {
      if (isSignedIn) {
        return;
      }
      const { data } = await checkVisitorVisits(id);
      if (data.messages >= dailyMessageLimit) {
        dispatch({ type: SET_LIMIT_LOCK, payload: true });
      }
    } catch (error) {
      logger.error('Error loading visitor messages: %o', error);
    }
  };

  // TODO: use similar logic for useAssistantLogic and usePublicAssistantLogic
  const onSubmit = async (data: CreateMessageDto) => {
    // TODO: Temporary restriction - only authenticated users can send messages
    // Future implementation should include guest user support or a clear user journey for non-authenticated users
    if (!userVisitorId) {
      startTransition(() => router.push('/sign-in'));
      return;
    }

    scrollToBottom();
    const userMessage = {
      public_id: `user-${Date.now()}`,
      role: Role.USER,
      content: data.prompt,
      created_at: new Date(),
      mode: data.mode,
      message_type: data.messageType || 'TEXT',
      voice_duration_seconds: data.voiceDurationSeconds,
      voice_played: false,
    };
    dispatch({ type: SET_MODE, payload: data.mode || ChatType.RAG });

    // Cast to unknown first to avoid type mismatch
    // ugly workaround to satisfied Clerk UserResourceTypes
    const clerkUser = user as unknown as UserResource;

    try {
      await handleAssistantStream({
        mode: AssistantMode.INTERNAL,
        dispatch,
        messages: state.messages,
        userMessageId: state.userMessageId,
        userMessage,
        t,
        tChainErrors,
        tApiEvents,
        threadId,
        responseType: state.responseType,
        streamedMessage: state.streamedMessage,
        threadsDispatch,
        scrollFn: scrollToBottom,
        errorToast,
        promptFormRef,
        data,
        chatType: data.mode,
        user: clerkUser,
      });
    } catch {
      errorToast({ message: 'sending-error' });
    }
  };

  const handleResponseType = () => {
    dispatch({ type: SET_MODE_VOICE, payload: ChatResponseType.VOICE });
    setIsRecording(true);
  };

  const closeVoiceMode = () => {
    setIsRecording(false);
    dispatch({ type: SET_MODE_VOICE, payload: ChatResponseType.TEXT });
  };

  const isLocked = () => {
    if (isSignedIn) return false;
    return state.isLimitLock;
  };

  const setVoiceMessageAsPlayed = async (messageId: string) => {
    try {
      dispatch({ type: SET_MESSAGE_PLAYED, payload: messageId });
    } catch (error) {
      logger.error('Error marking message as played: %o', error);
    }
  };

  const handleVoiceResult = (text: string, recordingTime: number) => {
    onSubmit({
      mode: state.mode,
      prompt: text,
      messageType: 'VOICE',
      voiceDurationSeconds: recordingTime,
    });
  };

  return {
    messageLoadingText: state.messageLoadingText,
    handleResponseType,
    messagesEndDivRef,
    isGlobalLoading,
    streamedMessage: state.streamedMessage,
    isPublicAccess,
    userVisitorId,
    isSearchOpen,
    responseType: state.responseType,
    isLimitLock: state.isLimitLock,
    closeSearch,
    isSignedIn,
    messages: state.messages,
    modalRef,
    onSubmit,
    isLocked,
    dispatch,
    promptFormRef,
    isRecording,
    closeVoiceMode,
    setVoiceMessageAsPlayed,
    handleVoiceResult,
  };
};
