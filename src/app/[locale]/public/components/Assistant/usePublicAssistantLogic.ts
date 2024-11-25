import { useReducer, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { StatusCodes } from 'http-status-codes';
import { AxiosError } from 'axios';
import { Role } from '@prisma/client';

import { LOCAL_STORAGE_THREAD_KEY } from '@/app/components/config';

import { sendMessage, deleteUserMessage } from '@/app/actions';
import { useThreadsContext } from '@/app/hooks/useThreadsContext';
import {
  checkVisitorVisits,
  fetchMessagesFromApi,
} from '@/app/lib/services/api';

import type { CreateMessageDto } from '@/app/contracts/Message';
import {
  type State,
  type Action,
  reducerActions,
  type ErrorEvent,
} from './types';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';

import { useApi } from '@/app/hooks/useApi';
import { PromptFormRef } from '@/app/components/Assistant/PromptForm/PromptForm';
import { getErrorMessage } from '@/app/components/Assistant/utils';

const { errorToast } = statusToast();
const {
  SET_INITIAL_LOAD,
  ADD_MESSAGE,
  APPEND_TO_STREAMED_MESSAGE,
  SET_LIMIT_LOCK,
  SET_LOADING_TEXT,
  SET_MESSAGES,
  SET_MESSAGE_ERROR,
  SET_MESSAGE_ID,
  SET_MESSAGE_LOADING,
  SET_STREAMED_MESSAGE,
  SET_IS_ERROR,
  REMOVE_MESSAGE,
} = reducerActions;

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

  const [state, dispatch] = useReducer(reducer, initialState);
  const isGlobalLoading =
    !state.isError && (state.isMessageLoading || isLoading);
  const promptFormRef = useRef<PromptFormRef>(null);

  function reducer(state: State, action: Action): State {
    switch (action.type) {
      case SET_INITIAL_LOAD:
        return { ...state, isInitialLoad: action.payload };
      case SET_MESSAGE_LOADING:
        return { ...state, isMessageLoading: action.payload };
      case SET_MESSAGE_ID:
        return { ...state, userMessageId: action.payload };
      case SET_LIMIT_LOCK:
        return { ...state, isLimitLock: action.payload };
      case SET_LOADING_TEXT:
        return { ...state, messageLoadingText: action.payload };
      case SET_MESSAGE_ERROR:
        return { ...state, isMessageError: action.payload };
      case SET_STREAMED_MESSAGE:
        return { ...state, streamedMessage: action.payload };
      case APPEND_TO_STREAMED_MESSAGE:
        return {
          ...state,
          streamedMessage: {
            content:
              (state.streamedMessage?.content || '') + action.payload.content,
            runId: action.payload.run_id,
            created_at:
              state.streamedMessage?.created_at || new Date().toISOString(),
          },
        };
      case SET_MESSAGES:
        return { ...state, messages: action.payload };
      case ADD_MESSAGE:
        return {
          ...state,
          messages: [...state.messages, action.payload],
        };
      case SET_IS_ERROR:
        return { ...state, isError: action.payload };
      case REMOVE_MESSAGE:
        return {
          ...state,
          messages: state.messages.filter(
            (message) => message.public_id !== action.payload
          ),
        };
      default:
        return state;
    }
  }

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

  const connectToStream = (userMessageId: string) => {
    const eventSourceUrl = `/api/guest-threads/${threadId}/${userMessageId}/${organizationId}`;
    const eventSource = new EventSource(eventSourceUrl);

    let accumulatingMessage = '';

    eventSource.addEventListener('message', (event) => {
      const eventMessage = JSON.parse(event.data);
      if (eventMessage.type === 'delta') {
        const textChunk = eventMessage.payload.content;
        const runId = eventMessage.payload.runId;
        accumulatingMessage += textChunk;
        dispatch({ type: SET_MESSAGE_LOADING, payload: false });

        dispatch({
          type: APPEND_TO_STREAMED_MESSAGE,
          payload: { content: textChunk, run_id: runId },
        });

        scrollToBottom();
      } else if (eventMessage.type === 'message') {
        if (accumulatingMessage.trim()) {
          dispatch({
            type: ADD_MESSAGE,
            payload: {
              public_id: eventMessage.payload.public_id,
              role: eventMessage.payload.role,
              content: accumulatingMessage,
              created_at: eventMessage.payload.created_at,
              run_id: eventMessage.payload.runId,
            },
          });
          dispatch({ type: SET_STREAMED_MESSAGE, payload: null });
        }

        accumulatingMessage = '';
      }
    });

    eventSource.addEventListener('error', async (event: ErrorEvent) => {
      eventSource.close();

      const errorMessage = getErrorMessage(event, tChainErrors);
      const lastUserMessage = state.messages.findLast(
        (message) => message.role === Role.USER
      );

      if (lastUserMessage) {
        try {
          //Move to backend after refactoring message handling
          await deleteUserMessage(state.userMessageId);
          dispatch({
            type: REMOVE_MESSAGE,
            payload: lastUserMessage.public_id,
          });
        } catch (error) {
          logger.error('Error removing message: %o', error);
        }
      }

      //Update user prompt input with last message data
      dispatch({ type: SET_IS_ERROR, payload: true });

      promptFormRef.current?.reset(lastUserMessage?.content || '');
      errorToast({ message: errorMessage });

      logger.error('Stream error: %o', errorMessage);
    });

    return eventSource;
  };

  useEffect(() => {
    if (state.userMessageId !== '') {
      const eventSource = connectToStream(state.userMessageId);

      return () => eventSource.close();
    }
  }, [state.userMessageId]);

  const onSubmit = async (data: CreateMessageDto) => {
    scrollToBottom();
    const userMessage = {
      public_id: `user-${Date.now()}`,
      role: Role.USER,
      content: data.prompt,
      created_at: new Date(),
    };

    dispatch({ type: ADD_MESSAGE, payload: userMessage });
    dispatch({ type: SET_IS_ERROR, payload: false });
    dispatch({ type: SET_MESSAGE_LOADING, payload: true });
    dispatch({
      type: SET_LOADING_TEXT,
      payload: t('status-thinking'),
    });

    try {
      const messageResponse = await sendMessage(
        threadId,
        data,
        visitorId.current
      );
      const newThread = {
        public_id: threadId,
        messages: [userMessage],
        created_at: new Date(),
      };

      if (messageResponse.status === StatusCodes.BAD_REQUEST) {
        dispatch({ type: SET_MESSAGE_ERROR, payload: true });
        errorToast({ message: 'Error occured while sending message' });
        return;
      }

      if (
        messageResponse.status === StatusCodes.CREATED &&
        messageResponse.message?.public_id
      ) {
        dispatch({
          type: SET_MESSAGE_ID,
          payload: messageResponse.message.public_id,
        });
        dispatch({
          type: SET_LOADING_TEXT,
          payload: t('status-asking-ai'),
        });
      }

      threadsDispatch({
        type: 'ADD_THREAD',
        payload: newThread,
      });
    } catch (error) {
      if (
        error instanceof AxiosError &&
        error.status === StatusCodes.BAD_REQUEST
      ) {
        dispatch({ type: SET_MESSAGE_ERROR, payload: true });
        errorToast({ message: 'Error occured while sending message' });
      }
      logger.error('Error submitting message: %o', error);
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
    isLocked,
    dispatch,
    onSubmit,
    isError: state.isError,
    promptFormRef,
  };
};
