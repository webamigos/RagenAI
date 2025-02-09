import { useReducer, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Role } from '@prisma/client';
import { usePathname } from 'next/navigation';

import { useThreadsContext } from '@/app/hooks/useThreadsContext';
import {
  checkVisitorVisits,
  fetchMessagesFromApi,
} from '@/app/lib/services/api';

import {
  ChatResponseType,
  type CreateMessageDto,
} from '@/app/contracts/Message';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';

import { useApi } from '@/app/hooks/useApi';
import { PromptFormRef } from '@/app/components/Assistant/PromptForm/PromptForm';
import { handleAssistantStream } from '@/app/components/Assistant/utils';
import { publicAssistantReducer, type State } from './publicAssistantReducer';
import { AssistantMode } from '@/app/contracts/Assistant';
import { sharedReducerActions } from '@/app/components/Assistant/reducer';

const { errorToast } = statusToast();

const { SET_INITIAL_LOAD, ADD_MESSAGE, SET_LIMIT_LOCK, SET_MESSAGES } =
  sharedReducerActions;

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
  const visitorId = useRef<string>(
    localStorage.getItem('visitorId') ||
      `visitor-${Math.random().toString(36).substr(2, 9)}`
  );

  useEffect(() => {
    if (!localStorage.getItem('visitorId')) {
      localStorage.setItem('visitorId', visitorId.current);
    }
  }, []);

  const { isLoading } = useApi(() =>
    fetchMessagesFromApi(threadId, visitorId.current)
  );

  const messagesEndDivRef = useRef<HTMLDivElement>(null);

  const t = useTranslations('Index');
  const tChainErrors = useTranslations('chain-errors');
  const { dispatch: threadsDispatch } = useThreadsContext();

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
      const response = await fetchMessagesFromApi(threadId, visitorId.current);
      if (response) {
        dispatch({ type: SET_INITIAL_LOAD, payload: false });
        dispatch({ type: SET_MESSAGES, payload: response.data });
      }
    } catch (error) {
      logger.error('Error fetching messages: %o', error);
    }
  };

  useEffect(() => {
    fetchData();
    loadVisitorMessages();
  }, []);

  const loadVisitorMessages = async () => {
    try {
      const { data } = await checkVisitorVisits(visitorId.current);
      if (data.messages >= 1111) {
        dispatch({ type: SET_LIMIT_LOCK, payload: true });
      }
    } catch (error) {
      logger.error('Error loading visitor messages: %o', error);
    }
  };

  // TODO: use similar logic for useAssistantLogic and usePublicAssistantLogic
  const onSubmit = async (data: CreateMessageDto) => {
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
        threadId,
        responseType: ChatResponseType.TEXT,
        streamedMessage: state.streamedMessage,
        threadsDispatch,
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
