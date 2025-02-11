import { useReducer, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Role } from '@prisma/client';
import { useRouter } from '@/i18n/routing';
import { usePathname } from 'next/navigation';

import { useThreadsContext } from '@/app/hooks/useThreadsContext';
import { useNewThread } from '@/app/[locale]/public/hooks/useNewThread';
import { useSessionStorage } from '@/app/[locale]/public/hooks/useSessionStorage';
import {
  // checkVisitorVisits,
  fetchMessagesFromApi,
} from '@/app/lib/services/api';

import {
  ChatResponseType,
  type CreateMessageDto,
} from '@/app/contracts/Message';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';

import { PromptFormRef } from '@/app/components/Assistant/PromptForm/PromptForm';
import { handleAssistantStream } from '@/app/components/Assistant/handle-assistant-stream';
import { publicAssistantReducer, type State } from './publicAssistantReducer';
import { AssistantMode } from '@/app/contracts/Assistant';
import { sharedReducerActions } from '@/app/components/Assistant/reducer';
import { sendMessage } from '@/app/actions';
import { StatusCodes } from 'http-status-codes';

const { errorToast } = statusToast();

const {
  SET_INITIAL_LOAD,
  SET_LIMIT_LOCK,
  SET_IS_ERROR,
  SET_MESSAGE_ERROR,
  ADD_MESSAGE,
  SET_MESSAGES,
  SET_MESSAGE_LOADING,
  SET_LOADING_TEXT,
} = sharedReducerActions;

export const usePublicAssistantLogic = (
  initialThreadId: string | null,
  organizationId: string,
  widgetMode = false
) => {
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
  };

  const { push } = useRouter();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initialThreadId
  );

  const pathname = usePathname();
  const visitorId = useRef<string>(
    localStorage.getItem('visitorId') ||
      `visitor-${Math.random().toString(36).substr(2, 9)}`
  );

  useEffect(() => {
    if (!localStorage.getItem('visitorId')) {
      localStorage.setItem('visitorId', visitorId.current);
    }
  }, []);

  const messagesEndDivRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('Index');
  const tChainErrors = useTranslations('chain-errors');
  const tApiEvents = useTranslations('api-events');
  const { dispatch: threadsDispatch } = useThreadsContext();

  const [state, dispatch] = useReducer(publicAssistantReducer, initialState);

  const promptFormRef = useRef<PromptFormRef>(null);
  const isPublicAccess = pathname.includes('/public');

  const { handleNewThread, isLoading: isNewThreadLoading } = useNewThread({
    organizationId,
    widgetMode,
    onThreadCreated: (threadId: string) => setActiveThreadId(threadId),
  });

  const fetchData = async () => {
    if (!activeThreadId) return;

    dispatch({ type: SET_MESSAGE_LOADING, payload: true });
    try {
      const response = await fetchMessagesFromApi(
        activeThreadId,
        visitorId.current
      );
      if (response) {
        dispatch({ type: SET_MESSAGES, payload: response.data });
        dispatch({ type: SET_INITIAL_LOAD, payload: false });
      }
    } catch (error) {
      logger.error('Error fetching messages: %o', error);
      dispatch({ type: SET_IS_ERROR, payload: true });
    }
  };

  useEffect(() => {
    if (activeThreadId) {
      fetchData();
    }
  }, [activeThreadId]);

  useEffect(() => {
    const createInitialThread = async () => {
      if (!initialThreadId) {
        const newThreadId = await handleNewThread();
        if (newThreadId) {
          setActiveThreadId(newThreadId);
        }
      }
    };

    createInitialThread();
  }, [initialThreadId]);

  const {
    storedValue: initialPrompt,
    setValue: setInitialPrompt,
    removeValue: removeInitialPrompt,
  } = useSessionStorage<string | null>('initialPrompt', null);

  const {
    storedValue: lastUserMessage,
    setValue: setLastUserMessage,
    removeValue: removeLastUserMessage,
  } = useSessionStorage<{ content: string; id: string } | null>(
    'lastUserMessage',
    null
  );

  const {
    storedValue: processedMessages,
    setValue: setProcessedMessages,
    removeValue: removeProcessedMessages,
  } = useSessionStorage<string[]>(`processed_messages_${activeThreadId}`, []);

  useEffect(() => {
    if (!activeThreadId) {
      removeInitialPrompt();
      removeLastUserMessage();
      removeProcessedMessages();
    }
  }, [activeThreadId]);

  const scrollToBottom = () =>
    messagesEndDivRef.current?.scrollIntoView({ behavior: 'smooth' });

  const onSubmit = async (data: CreateMessageDto) => {
    if (!activeThreadId) return;

    scrollToBottom();
    const userMessage = {
      public_id: `user-${Date.now()}`,
      role: Role.USER,
      content: data.prompt,
      created_at: new Date(),
    };

    try {
      await handleAssistantStream({
        mode: AssistantMode.PUBLIC,
        organizationId,
        dispatch,
        messages: state.messages,
        userMessageId: state.userMessageId,
        userMessage,
        t,
        tChainErrors,
        tApiEvents,
        threadId: activeThreadId,
        responseType: ChatResponseType.TEXT,
        streamedMessage: state.streamedMessage,
        threadsDispatch,
        scrollFn: scrollToBottom,
        errorToast,
        promptFormRef,
        data,
        chatType: data.mode,
        // visitorId.current
      });
    } catch (error) {
      errorToast({ message: 'sending-error' });
    }
  };

  const handleInitialSubmit = async (data: { prompt: string }) => {
    if (!activeThreadId) return;

    try {
      setInitialPrompt(data.prompt);
      dispatch({ type: SET_MESSAGE_LOADING, payload: true });
      dispatch({ type: SET_LOADING_TEXT, payload: t('status-thinking') });

      const userMessage = {
        public_id: `user-${Date.now()}`,
        role: Role.USER,
        content: data.prompt,
        created_at: new Date(),
      };

      dispatch({ type: ADD_MESSAGE, payload: userMessage });

      const messageResponse = await sendMessage(
        activeThreadId,
        { prompt: data.prompt },
        visitorId.current
      );

      if (messageResponse.status === StatusCodes.BAD_REQUEST) {
        dispatch({ type: SET_MESSAGE_ERROR, payload: true });
        errorToast({ message: 'Error occurred while sending message' });
        return;
      }

      if (
        messageResponse.status === StatusCodes.CREATED &&
        messageResponse.message?.public_id
      ) {
        const assistantMessageId = messageResponse.message.public_id;
        setLastUserMessage({
          content: data.prompt,
          id: messageResponse.message.public_id,
        });

        threadsDispatch({
          type: 'ADD_THREAD',
          payload: {
            public_id: activeThreadId,
            messages: [userMessage],
            created_at: new Date(),
          },
        });

        // Set loading state before redirect
        dispatch({ type: SET_LOADING_TEXT, payload: t('status-asking-ai') });
        localStorage.setItem('isWaitingForResponse', 'true');

        push(
          `/public/${organizationId}/threads/${activeThreadId}?msg=${assistantMessageId}`
        );
      }
    } catch (error) {
      dispatch({ type: SET_MESSAGE_ERROR, payload: true });
      logger.error('Error sending initial message: %o', error);
      errorToast({ message: 'Error sending message' });
    }
  };

  // Add effect to check for waiting response state
  useEffect(() => {
    const isWaiting = localStorage.getItem('isWaitingForResponse');
    if (isWaiting === 'true') {
      dispatch({ type: SET_MESSAGE_LOADING, payload: true });
      dispatch({ type: SET_LOADING_TEXT, payload: t('status-asking-ai') });
    }
    return () => {
      localStorage.removeItem('isWaitingForResponse');
    };
  }, []);

  const isGlobalLoading =
    !state.isError && (state.isMessageLoading || isNewThreadLoading);

  return {
    messageLoadingText: state.messageLoadingText,
    messagesEndDivRef,
    isMessageLoading: state.isMessageLoading,
    isGlobalLoading,
    streamedMessage: state.streamedMessage,
    userMessageId: state.userMessageId,
    isLimitLock: state.isLimitLock,
    messages: state.messages,
    isPublicAccess,
    isLocked: () => state.isLimitLock,
    dispatch,
    onSubmit,
    isError: state.isError,
    promptFormRef,
    activeThreadId,
    handleInitialSubmit,
    isNewThreadLoading,
    initialPrompt,
    lastUserMessage,
    processedMessages,
  };
};
