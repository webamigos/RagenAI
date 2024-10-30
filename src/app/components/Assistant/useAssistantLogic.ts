import { useReducer, useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { StatusCodes } from 'http-status-codes';
import { AxiosError } from 'axios';
import { Role } from '@prisma/client';
import { useUser } from '@clerk/nextjs';

import { LOCAL_STORAGE_THREAD_KEY } from '../config';
import { dailyMessageLimit } from '../../config';
import { getUserMessages, sendMessage } from '../../actions';
import { useApi } from '../../hooks/useApi';
import { useThreadsContext } from '../../hooks/useThreadsContext';
import {
  checkVisitorVisits,
  fetchMessagesFromApi,
} from '../../lib/services/api';
import { loadFingerprint } from '../../lib/utils/fingerprint';

import type { CreateMessageDto } from '../../contracts/Message';
import { type State, type Action, reducerActions } from './types';
import { logger } from '@/app/lib/utils/logger';

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
} = reducerActions;

export const useAssistantLogic = (threadId: string) => {
  const { isLoaded, isSignedIn, user } = useUser();
  const [visitorId, setVisitorId] = useState<string | null>(null);

  const initialState: State = {
    isInitialLoad: true,
    isMessageLoading: false,
    userMessageId: '',
    isLimitLock: false,
    messageLoadingText: '',
    isMessageError: false,
    streamedMessage: null,
    messages: [],
  };

  const userVisitorId = (user?.publicMetadata.visitorId as string) || undefined;

  useEffect(() => {
    if (isLoaded && !isSignedIn && !visitorId) {
      loadFingerprint().then((id) => {
        setVisitorId(id);
      });
    }
  }, [isLoaded, isSignedIn, visitorId]);

  const id = userVisitorId || visitorId;

  const { isLoading } = useApi(() => {
    if (id) {
      return fetchMessagesFromApi(threadId, id);
    }
    return Promise.resolve(null);
  });

  const messagesEndDivRef = useRef<HTMLDivElement>(null);

  const t = useTranslations('Index');
  const { dispatch: threadsDispatch } = useThreadsContext();

  const [
    {
      isMessageLoading,
      userMessageId,
      isLimitLock,
      messageLoadingText,
      streamedMessage,
      messages,
    },
    dispatch,
  ] = useReducer(reducer, initialState);

  const isGlobalLoading = isMessageLoading || isLoading;

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
      default:
        return state;
    }
  }

  const scrollToBottom = () =>
    messagesEndDivRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchData = async (id: string) => {
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
      const id = userVisitorId || visitorId;
      if (id) {
        fetchData(id);
      }
    }
  }, [isLoaded, userVisitorId, visitorId]);

  useEffect(() => {
    const localStorageThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
    if (!localStorageThreadId) {
      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
    }
  }, [threadId]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
      const id = userVisitorId || visitorId;
      if (id) {
        loadVisitorMessages(id);
      }
    }
  }, [messages, userVisitorId, visitorId]);

  const loadVisitorMessages = async (id: string) => {
    try {
      const { data } = await checkVisitorVisits(id);
      if (data.messages >= dailyMessageLimit) {
        dispatch({ type: SET_LIMIT_LOCK, payload: true });
      }
    } catch (error) {
      logger.error('Error loading visitor messages: %o', error);
    }
  };

  const connectToStream = (userMessageId: string) => {
    const eventSourceUrl = user
      ? `/api/threads/${threadId}/${userMessageId}`
      : `/api/guest-threads/${threadId}/${userMessageId}`;
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

    eventSource.addEventListener('error', (error) => {
      logger.error('Stream error: %o', error);
      logger.error('EventSource State: %d', eventSource.readyState);
      eventSource.close();
    });

    return eventSource;
  };

  useEffect(() => {
    if (userMessageId !== '') {
      const eventSource = connectToStream(userMessageId);

      return () => eventSource.close();
    }
  }, [userMessageId]);

  const onSubmit = async (data: CreateMessageDto) => {
    scrollToBottom();
    const userMessage = {
      public_id: `user-${Date.now()}`,
      role: Role.USER,
      content: data.prompt,
      created_at: new Date(),
    };
    dispatch({ type: ADD_MESSAGE, payload: userMessage });

    dispatch({
      type: SET_MESSAGE_LOADING,
      payload: true,
    });
    dispatch({
      type: SET_LOADING_TEXT,
      payload: t('status-thinking'),
    });

    const id = userVisitorId || visitorId || (await loadFingerprint());
    const messageResponse = await sendMessage(threadId, data, id);
    const response = await getUserMessages(id);
    const threads = response.threads;
    const newThread = {
      public_id: threads![0].public_id,
      messages: [userMessage],
      created_at: new Date(),
    };

    try {
      if (messageResponse.status === StatusCodes.BAD_REQUEST) {
        dispatch({ type: SET_MESSAGE_ERROR, payload: true });
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
      }
      logger.error('Error submitting message: %o', error);
    }
  };

  const isLocked = () => {
    if (isSignedIn) return false;
    return isLimitLock;
  };

  return {
    messageLoadingText,
    messagesEndDivRef,
    isMessageLoading,
    isGlobalLoading,
    streamedMessage,
    userMessageId,
    isLimitLock,
    isSignedIn,
    messages,
    isLocked,
    dispatch,
    onSubmit,
  };
};
