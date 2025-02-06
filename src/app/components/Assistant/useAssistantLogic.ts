import {
  useReducer,
  useEffect,
  useRef,
  startTransition,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import { StatusCodes } from 'http-status-codes';
import axios, { AxiosError } from 'axios';
import { Role } from '@prisma/client';
import { useUser } from '@clerk/nextjs';

import { useRouter, usePathname } from '@/i18n/routing';
import { LOCAL_STORAGE_THREAD_KEY } from '../config';
import { dailyMessageLimit } from '../../config';
import { getUserMessages, sendMessage, deleteUserMessage } from '../../actions';
import { useApi } from '../../hooks/useApi';
import { useThreadsContext } from '../../hooks/useThreadsContext';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import {
  checkVisitorVisits,
  fetchMessagesFromApi,
} from '../../lib/services/api';

import {
  ChatResponseType,
  ChatType,
  type CreateMessageDto,
} from '../../contracts/Message';
import {
  type State,
  type Action,
  reducerActions,
  type ErrorEvent,
} from './types';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';
import { PromptFormRef } from './PromptForm/PromptForm';
import { getErrorMessage } from './utils';
import { ApiEvent, parseSseString } from '@/libs/sse/prepare-sse-message';
import { ApiSseMessageDelta, ApiSseMessageEvent } from '@/app/contracts/Events';

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
  SET_MODE,
  SET_MODE_VOICE,
  SET_MESSAGE_PLAYED,
} = reducerActions;

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
  const { dispatch: threadsDispatch } = useThreadsContext();
  const isPublicAccess = pathname.includes('/public');

  const [
    {
      isMessageLoading,
      userMessageId,
      mode,
      isLimitLock,
      messageLoadingText,
      streamedMessage,
      messages,
      isError,
      responseType,
    },
    dispatch,
  ] = useReducer(reducer, initialState);

  const isGlobalLoading = !isError && (isMessageLoading || isLoading);
  const promptFormRef = useRef<PromptFormRef>(null);
  const [isRecording, setIsRecording] = useState(false);

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
        return { ...state, isError: action.payload, isMessageLoading: false };
      case REMOVE_MESSAGE:
        return {
          ...state,
          messages: state.messages.filter(
            (message) => message.public_id !== action.payload
          ),
        };
      case SET_MODE:
        return { ...state, mode: action.payload };
      case SET_MODE_VOICE:
        return { ...state, responseType: action.payload };
      case SET_MESSAGE_PLAYED:
        return {
          ...state,
          messages: state.messages.map((message) =>
            message.public_id === action.payload
              ? { ...message, voice_played: true }
              : message
          ),
        };
      default:
        return state;
    }
  }

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
    if (messages.length > 0) {
      scrollToBottom();
      const id = userVisitorId;
      if (id) {
        loadVisitorMessages(id);
      }
    }
  }, [messages, userVisitorId]);

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

  const connectToStream = (userMessageId: string, mode: ChatType) => {
    const eventSourceUrl = user
      ? `/api/threads/${threadId}/${userMessageId}?mode=${mode}`
      : `/api/guest-threads/${threadId}/${userMessageId}`;
    const eventSource = new EventSource(eventSourceUrl);

    let accumulatingMessage = '';

    eventSource.addEventListener('message', (event) => {
      const eventMessage = JSON.parse(event.data);
      if (eventMessage.type === 'delta') {
        const textChunk = eventMessage.payload.content;
        const runId = eventMessage.payload.runId;
        accumulatingMessage += textChunk;

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
              message_type: responseType,
            },
          });
          dispatch({ type: SET_STREAMED_MESSAGE, payload: null });
          dispatch({ type: SET_MESSAGE_LOADING, payload: false });
        }

        accumulatingMessage = '';
      }
    });

    eventSource.addEventListener('error', async (event: ErrorEvent) => {
      eventSource.close();
      const errorMessage = getErrorMessage(event, tChainErrors);
      const shouldIgnoreError = !errorMessage && !streamedMessage;
      if (shouldIgnoreError) {
        return;
      }

      const lastUserMessage = messages.findLast(
        (message) => message.role === Role.USER
      );

      if (lastUserMessage) {
        try {
          //Move to backend after refactoring message handling
          await deleteUserMessage(userMessageId);
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
      errorToast({ message: errorMessage || tChainErrors('unknown-error') });

      logger.error('Stream error: %o', errorMessage);
    });

    return eventSource;
  };

  useEffect(() => {
    if (userMessageId !== '') {
      const eventSource = connectToStream(userMessageId, mode);

      return () => eventSource.close();
    }
  }, [userMessageId]);

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
    dispatch({ type: ADD_MESSAGE, payload: userMessage });
    dispatch({ type: SET_MODE, payload: data.mode || ChatType.RAG });
    dispatch({ type: SET_IS_ERROR, payload: false });
    dispatch({
      type: SET_MESSAGE_LOADING,
      payload: true,
    });
    dispatch({
      type: SET_LOADING_TEXT,
      payload: t('status-thinking'),
    });

    const streamUrl = user
      ? `/api/threads/${threadId}?mode=${mode}`
      : `/api/guest-threads/${threadId}/`;
    const apiStream = await axios.post(streamUrl, data, {
      responseType: 'stream',
      adapter: 'fetch',
      headers: {
        Accept: 'text/event-stream',
      },
    });

    if (!apiStream.data) {
      return;
    }

    const reader = apiStream.data
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let buffer = ''; // Initialize a buffer to accumulate chunks
    let accumulatingMessage = '';
    let runId = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break; // Exit the loop if the stream is done
      }

      buffer += value;

      // Process the buffer to extract complete messages
      let messages = buffer.split('\n\n'); // Assuming messages are separated by double newlines
      buffer = messages.pop() || ''; // Keep the last incomplete message in the buffer

      for (const msg of messages) {
        // Process the value (which is a string)
        // const message = parseSseString(decoder.decode(data)); // Decode the buffer to a string and then parse SSE event format to JSON
        // const messageEvent = message.event as ApiEvent;
        // const messageData = message.data;

        const message = parseSseString(msg);
        // You can see message format in browser console
        // console.log('on frontend: ', message);
        const messageEvent = message.event;
        const messageData = message.data;

        dispatch({
          type: SET_LOADING_TEXT,
          payload: messageEvent,
        });

        if (messageEvent === 'delta') {
          const data = messageData as ApiSseMessageDelta;
          const textChunk = data.content;
          runId = data.runId || ''; // TODO: refactor to reduce transfer
          accumulatingMessage += textChunk;

          // console.log({ accumulatingMessage, textChunk });

          dispatch({
            type: APPEND_TO_STREAMED_MESSAGE,
            payload: { content: textChunk, run_id: runId },
          });

          scrollToBottom();
        } else if (messageEvent == 'final_response' && messageData) {
          const data = messageData as ApiSseMessageEvent;
          if (accumulatingMessage.trim()) {
            dispatch({
              type: ADD_MESSAGE,
              payload: {
                public_id: data.id,
                role: data.role,
                content: data.content,
                created_at: new Date(), // FIXME: resolved in DEV-78
                run_id: runId,
                message_type: responseType,
              },
            });
            dispatch({ type: SET_STREAMED_MESSAGE, payload: null });
            dispatch({ type: SET_MESSAGE_LOADING, payload: false });
          }
        }
      }

      //   try {
      //     const messageResponse = await sendMessage(
      //       threadId,
      //       data,
      //       userVisitorId
      //     );
      //     const response = await getUserMessages(userVisitorId);
      //     const threads = response.threads;
      //     const newThread = {
      //       public_id: threads![0].public_id,
      //       messages: [userMessage],
      //       created_at: new Date(),
      //     };

      //     if (messageResponse.status === StatusCodes.BAD_REQUEST) {
      //       dispatch({ type: SET_MESSAGE_ERROR, payload: true });
      //       errorToast({ message: 'sending-error' });
      //       return;
      //     }

      //     if (
      //       messageResponse.status === StatusCodes.CREATED &&
      //       messageResponse.message?.public_id
      //     ) {
      //       dispatch({
      //         type: SET_MESSAGE_ID,
      //         payload: messageResponse.message.public_id,
      //       });
      //       dispatch({
      //         type: SET_LOADING_TEXT,
      //         payload: t('status-asking-ai'),
      //       });
      //     }
      //     threadsDispatch({
      //       type: 'ADD_THREAD',
      //       payload: newThread,
      //     });
      //   } catch (error) {
      //     if (
      //       error instanceof AxiosError &&
      //       error.status === StatusCodes.BAD_REQUEST
      //     ) {
      //       dispatch({ type: SET_MESSAGE_ERROR, payload: true });
      //       errorToast({ message: 'sending-error' });
      //     }
      //     logger.error('Error submitting message: %o', error);
      //   }
      // }
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
    return isLimitLock;
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
      mode,
      prompt: text,
      messageType: 'VOICE',
      voiceDurationSeconds: recordingTime,
    });
  };

  return {
    messageLoadingText,
    handleResponseType,
    messagesEndDivRef,
    isGlobalLoading,
    streamedMessage,
    isPublicAccess,
    userVisitorId,
    isSearchOpen,
    responseType,
    isLimitLock,
    closeSearch,
    isSignedIn,
    messages,
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
