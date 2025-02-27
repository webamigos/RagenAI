import { useReducer, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Role } from '@prisma/client';
import { usePathname } from 'next/navigation';

import {
  checkVisitorVisits,
  fetchMessagesFromApi,
} from '@/app/lib/services/api';

import {
  ChatResponseType,
  ChatType,
  type CreateMessageDto,
} from '@/app/contracts/Message';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';

import { useApi } from '@/app/hooks/useApi';
import { PromptFormRef } from '@/app/components/Assistant/PromptForm/PromptForm';
import { handleAssistantStream } from '@/app/components/Assistant/handle-assistant-stream';
import { publicAssistantReducer, type State } from './publicAssistantReducer';
import { AssistantMode } from '@/app/contracts/Assistant';
import { sharedReducerActions } from '@/app/components/Assistant/reducer';
import { visitorCookieName } from '@/app/config';
import { SESSION_STORAGE_TEMP_MESSAGE_KEY } from '@/app/components/config';
import { getVisitorIdFromBrowserCookie } from '@/app/lib/services/cookies.browser';

const { errorToast } = statusToast();

const { SET_INITIAL_LOAD, SET_LIMIT_LOCK, SET_MESSAGES } = sharedReducerActions;

export const usePublicAssistantLogic = (
  threadId: string,
  organizationId: string
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
  const pathname = usePathname();
  const [visitorId, setVisitorId] = useState('');

  const { isLoading } = useApi(() => fetchMessagesFromApi(threadId, visitorId));

  const messagesEndDivRef = useRef<HTMLDivElement>(null);

  const t = useTranslations('Index');
  const tChainErrors = useTranslations('chain-errors');
  const tApiEvents = useTranslations('api-events');

  const [state, dispatch] = useReducer(publicAssistantReducer, initialState);
  const isGlobalLoading =
    !state.isError && (state.isMessageLoading || isLoading);
  const promptFormRef = useRef<PromptFormRef>(null);
  const isPublicAccess = pathname.includes('/public');

  const scrollToBottom = () =>
    messagesEndDivRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchData = async () => {
    dispatch({ type: SET_INITIAL_LOAD, payload: true });

    try {
      const response = await fetchMessagesFromApi(threadId, visitorId);

      if (response) {
        dispatch({ type: SET_INITIAL_LOAD, payload: false });
        dispatch({ type: SET_MESSAGES, payload: response.data });

        // Check if we have a temporary message to process
        const tempMessage = sessionStorage.getItem(
          SESSION_STORAGE_TEMP_MESSAGE_KEY
        );
        if (tempMessage) {
          sessionStorage.removeItem(SESSION_STORAGE_TEMP_MESSAGE_KEY);

          const userMessage = {
            public_id: `user-${Date.now()}`,
            role: Role.USER,
            content: tempMessage,
            created_at: new Date(),
          };

          await handleAssistantStream({
            mode: AssistantMode.PUBLIC,
            organizationId,
            dispatch,
            messages: response.data,
            userMessageId: userMessage.public_id,
            userMessage,
            t,
            tChainErrors,
            tApiEvents,
            threadId,
            responseType: ChatResponseType.TEXT,
            streamedMessage: state.streamedMessage,
            scrollFn: scrollToBottom,
            errorToast,
            promptFormRef,
            data: {
              prompt: tempMessage,
              messageType: 'TEXT',
            },
            chatType: ChatType.RAG,
          });
        }
      }
    } catch (error) {
      logger.error('Error fetching messages: %o', error);
    }
  };

  useEffect(() => {
    const visitorCookieValue = getVisitorIdFromBrowserCookie();
    if (visitorCookieValue) {
      setVisitorId(visitorCookieValue);
    }

    fetchData();
    loadVisitorMessages();
  }, [visitorId]);

  const loadVisitorMessages = async () => {
    try {
      if (visitorId) {
        const { data } = await checkVisitorVisits(visitorId);
        if (data.messages >= 1111) {
          dispatch({ type: SET_LIMIT_LOCK, payload: true });
        }
      }
    } catch (error) {
      logger.error('Error loading visitor messages: %o', error);
    }
  };

  const onSubmit = async (data: CreateMessageDto) => {
    scrollToBottom();
    const userMessage = {
      public_id: `user-${Date.now()}`,
      role: Role.USER,
      content: data.prompt,
      created_at: new Date(),
      visitorId: visitorId,
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
        threadId,
        responseType: ChatResponseType.TEXT,
        streamedMessage: state.streamedMessage,
        scrollFn: scrollToBottom,
        errorToast,
        promptFormRef,
        data,
        chatType: data.mode,
      });
    } catch {
      errorToast({ message: 'sending-error' });
    }
  };

  const isLocked = () => state.isLimitLock;

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
    isLocked,
    dispatch,
    onSubmit,
    isError: state.isError,
    promptFormRef,
  };
};
