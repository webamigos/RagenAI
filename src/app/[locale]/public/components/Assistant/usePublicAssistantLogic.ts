import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Role } from '@prisma/client';
import { usePathname } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '@/store/hooks';

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
import { AssistantMode } from '@/app/contracts/Assistant';
import { SESSION_STORAGE_TEMP_MESSAGE_KEY } from '@/app/components/config';
import { getVisitorIdFromBrowserCookie } from '@/app/lib/services/cookies.browser';
import {
  setMessages,
  setInitialLoad,
  setLimitLock,
  setError,
  setThreadContext,
} from '@/store/assistant/assistantSlice';

const { errorToast } = statusToast();

export const usePublicAssistantLogic = (
  threadId: string,
  organizationId: string
) => {
  const pathname = usePathname();
  const [visitorId, setVisitorId] = useState('');
  const dispatch = useDispatch();

  const {
    messages,
    isLoading: isMessageLoading,
    userMessageId,
    isLimitLock,
    messageLoadingText,
    streamedMessage,
    error: isError,
  } = useAppSelector((state) => state.assistant);

  const { isLoading } = useApi(() => fetchMessagesFromApi(threadId, visitorId));

  const messagesEndDivRef = useRef<HTMLDivElement>(null);
  const promptFormRef = useRef<PromptFormRef>(null);

  const t = useTranslations('Index');
  const tChainErrors = useTranslations('chain-errors');
  const tApiEvents = useTranslations('api-events');

  const isGlobalLoading = !isError && (isMessageLoading || isLoading);
  const isPublicAccess = pathname.includes('/public');

  const scrollToBottom = () =>
    messagesEndDivRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchData = async () => {
    dispatch(setInitialLoad(true));

    try {
      const response = await fetchMessagesFromApi(threadId, visitorId);

      if (response) {
        dispatch(setInitialLoad(false));
        dispatch(setMessages(response.data.messages));
        dispatch(setThreadContext(response.data.threadContext));

        // Check if we have a temporary message to process
        const tempMessage = sessionStorage.getItem(
          SESSION_STORAGE_TEMP_MESSAGE_KEY
        );
        if (tempMessage) {
          const userMessage = {
            public_id: `user-${Date.now()}`,
            role: Role.USER,
            content: tempMessage,
            created_at: new Date(),
          };

          sessionStorage.removeItem(SESSION_STORAGE_TEMP_MESSAGE_KEY);

          await handleAssistantStream({
            mode: AssistantMode.PUBLIC,
            organizationId,
            messages: response.data.messages,
            userMessageId: userMessage.public_id,
            userMessage,
            t,
            tChainErrors,
            tApiEvents,
            threadId,
            responseType: ChatResponseType.TEXT,
            streamedMessage,
            scrollFn: scrollToBottom,
            errorToast,
            promptFormRef,
            data: {
              prompt: tempMessage,
              messageType: 'TEXT',
            },
            chatType: ChatType.RAG,
            reduxDispatch: dispatch,
          });
        }
      }
    } catch (error) {
      logger.error('Error fetching messages: %o', error);
      dispatch(setError('Error fetching messages'));
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
          dispatch(setLimitLock(true));
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
        messages,
        userMessageId,
        userMessage,
        t,
        tChainErrors,
        tApiEvents,
        threadId,
        responseType: ChatResponseType.TEXT,
        streamedMessage,
        scrollFn: scrollToBottom,
        errorToast,
        promptFormRef,
        data,
        chatType: ChatType.RAG,
        reduxDispatch: dispatch,
      });
    } catch {
      errorToast({ message: 'sending-error' });
    }
  };

  const isLocked = () => isLimitLock;

  return {
    messageLoadingText,
    messagesEndDivRef,
    isMessageLoading,
    isGlobalLoading,
    streamedMessage,
    userMessageId,
    isLimitLock,
    messages,
    isPublicAccess,
    isLocked,
    onSubmit,
    isError,
    promptFormRef,
  };
};
