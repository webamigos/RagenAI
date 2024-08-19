'use client';

import { useReducer, useEffect, useRef, type MouseEventHandler } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { StatusCodes } from 'http-status-codes';
import { AxiosError } from 'axios';

import { Role } from '@prisma/client';
import { useUser } from '@clerk/nextjs';

import { LOCAL_STORAGE_THREAD_KEY } from '../config';
import { dailyMessageLimit } from '../../config';
import { sendMessage } from '../../actions';
import { useApi } from '../../hooks/useApi';
import {
  checkVisitorVisits,
  fetchMessagesFromApi,
} from '../../lib/services/api';
import { loadFingerprint } from '../../lib/utils/fingerprint';

import type { CreateMessageDto } from '../../contracts/Message';
import { type State, type Action, reducerActions } from './types';

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

  const { data, isLoading, isSuccess } = useApi(() =>
    fetchMessagesFromApi(threadId)
  );

  const messagesEndDivRef = useRef<HTMLDivElement>(null);
  const { push } = useRouter();
  const locale = useLocale();
  const t = useTranslations('Index');
  const { isSignedIn } = useUser();

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

  const isGlobalLoading = isLoading || isMessageLoading;

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
            content: (state.streamedMessage?.content || '') + action.payload,
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

  const scrollToBottom = () => {
    messagesEndDivRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isSuccess && data) {
      dispatch({ type: SET_INITIAL_LOAD, payload: false });
      dispatch({ type: SET_MESSAGES, payload: data.data });
    }
    const localStorageThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
    if (!localStorageThreadId) {
      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
    }
  }, [isSuccess, data]);

  useEffect(() => {
    scrollToBottom();
    loadVisitorMessages();
  }, [messages]);

  const loadVisitorMessages = async () => {
    const visitorId = await loadFingerprint();
    const { data } = await checkVisitorVisits(visitorId);

    if (data.messages >= dailyMessageLimit) {
      dispatch({ type: SET_LIMIT_LOCK, payload: true });
    }
  };

  const connectToStream = () => {
    // const eventSource = new EventSource(`/api/threads/${threadId}/sse`);
    const eventSource = new EventSource(`/api/threads/${threadId}/sse/v2`);
    let accumulatingMessage = '';

    eventSource.addEventListener('message', (event) => {
      const eventMessage = JSON.parse(event.data);

      if (eventMessage.type === 'delta') {
        accumulatingMessage += eventMessage.payload.content;
        dispatch({ type: SET_MESSAGE_LOADING, payload: false });
        dispatch({
          type: APPEND_TO_STREAMED_MESSAGE,
          payload: eventMessage.payload.content,
        });
        scrollToBottom();
      } else if (eventMessage.type === 'message') {
        dispatch({ type: SET_MESSAGE_LOADING, payload: false });

        if (accumulatingMessage.trim()) {
          dispatch({
            type: ADD_MESSAGE,
            payload: {
              public_id: eventMessage.payload.public_id,
              role: eventMessage.payload.role,
              content: accumulatingMessage,
              created_at: eventMessage.payload.created_at,
            },
          });
        }

        accumulatingMessage = '';
        dispatch({ type: SET_STREAMED_MESSAGE, payload: null });
      }
    });

    return eventSource;
  };

  useEffect(() => {
    // Initiate the first call to connect to SSE API
    if (userMessageId !== '') {
      const eventSource = connectToStream();
      // As the component unmounts, close listener to SSE API
      return () => eventSource.close();
    }
  }, [userMessageId]);

  const handleCloseThread: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
    push(`/${locale}`);
  };

  const onSubmit = async (data: CreateMessageDto) => {
    scrollToBottom();

    try {
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
        type: SET_STREAMED_MESSAGE,
        payload: null,
      });
      dispatch({
        type: SET_LOADING_TEXT,
        payload: t('status-thinking'),
      });

      const visitorId = await loadFingerprint();
      const messageResponse = await sendMessage(threadId, data, visitorId);

      if (messageResponse.status === StatusCodes.BAD_REQUEST) {
        dispatch({ type: SET_MESSAGE_ERROR, payload: true });
        return;
      }

      if (
        messageResponse.status === StatusCodes.CREATED &&
        messageResponse.message?.public_id
      ) {
        // this is workaround to send message to opean ai thread and then reload sse here
        dispatch({
          type: SET_MESSAGE_ID,
          payload: messageResponse.message.public_id,
        });
        dispatch({
          type: SET_LOADING_TEXT,
          payload: t('status-asking-ai'),
        });
      }
      // TODO: vercel doesn't like to run this as server action
      // runAssistant(threadId); // refactored to streams, now SSE is listening if assistant run returns stream

      // on vercel this is not working good
      // const assistantResponse = await runAssistant(threadId);
      // if (assistantResponse.status === StatusCodes.OK) {
      //   setMessageLoadingText('Analyzing your question...');
      // } else {
      //   setMessageError(true);
      // }
    } catch (error) {
      if (
        error instanceof AxiosError &&
        error.status === StatusCodes.BAD_REQUEST
      ) {
        dispatch({ type: SET_MESSAGE_ERROR, payload: true });
      }
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
    handleCloseThread,
    isLocked,
    dispatch,
    onSubmit,
  };
};
