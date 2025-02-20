'use client';

import { type Dispatch, ReducerAction, RefObject } from 'react';

import {
  ApiSseMessageDelta,
  ApiSseMessageEvent,
  SseMessageError,
} from '@/app/contracts/Events';
import {
  type Action as InternalAssistantReducerAction,
  sharedReducerActions,
} from './reducer';
import { Role, Thread } from '@prisma/client';
import {
  ChatResponseType,
  ChatType,
  CreateMessageDto,
  MessageDto,
  StreamedMessageDto,
  ThreadHistoryResponse,
} from '@/app/contracts/Message';
import { threadsReducer } from '@/context/ThreadsContext';
import axios, { AxiosError } from 'axios';
import { type UserResource } from '@clerk/types';
import {
  ApiEvent,
  ApiEventData,
  parseSseString,
} from '@/libs/sse/prepare-sse-message';
import { deleteUserMessage } from '@/app/actions';
import { logger } from '@/app/lib/utils/logger';
import { ToastProps } from '@/app/lib/utils/toast';
import { PromptFormRef } from './PromptForm/PromptForm';
import { AssistantMode } from '@/app/contracts/Assistant';
import { StatusCodes } from 'http-status-codes';
import { type Action as PublicAssistantReducerAction } from '@/app/[locale]/public/components/Assistant/publicAssistantReducer';
import { type TranslationFn } from './types';
import { getErrorMessage } from './utils';

const {
  ADD_MESSAGE,
  APPEND_TO_STREAMED_MESSAGE,
  SET_LOADING_TEXT,
  SET_MESSAGE_ERROR,
  SET_MESSAGE_LOADING,
  SET_STREAMED_MESSAGE,
  SET_IS_ERROR,
  REMOVE_MESSAGE,
} = sharedReducerActions;

type CommonConfig = {
  messages: MessageDto[];
  userMessage: MessageDto;
  userMessageId: string;
  threadsState: ThreadHistoryResponse[];
  t: TranslationFn;
  tChainErrors: TranslationFn;
  tApiEvents: TranslationFn;
  threadId: Thread['public_id'];
  responseType: ChatResponseType;
  threadsDispatch: Dispatch<ReducerAction<typeof threadsReducer>>;
  data: CreateMessageDto;
  scrollFn: () => void;
  streamedMessage: StreamedMessageDto | null;
  errorToast: ({ message, position, autoClose }: ToastProps) => void;
  promptFormRef: RefObject<PromptFormRef>;
  organizationId?: string;
  chatType?: ChatType;
};
type HandleAssistantStreamConfig =
  | ({
      // internal
      mode: AssistantMode.INTERNAL;
      dispatch: Dispatch<InternalAssistantReducerAction>;
      user: UserResource | undefined | null;
      organizationId?: undefined;
    } & CommonConfig)
  | ({
      // public
      mode: AssistantMode.PUBLIC;
      dispatch: Dispatch<PublicAssistantReducerAction>;
      user?: undefined;
      organizationId: string;
    } & CommonConfig);

export const handleAssistantStream = async ({
  mode,
  organizationId,
  dispatch,
  messages,
  userMessage,
  userMessageId,
  t,
  tChainErrors,
  tApiEvents,
  threadId,
  responseType,
  threadsDispatch,
  threadsState,
  data,
  scrollFn,
  streamedMessage,
  errorToast,
  promptFormRef,
  chatType,
  user,
}: HandleAssistantStreamConfig) => {
  dispatch({ type: ADD_MESSAGE, payload: userMessage });
  dispatch({ type: SET_IS_ERROR, payload: false });
  dispatch({
    type: SET_MESSAGE_LOADING,
    payload: true,
  });
  dispatch({
    type: SET_LOADING_TEXT,
    payload: t('status-thinking'),
  });

  try {
    // This flow:
    // Creates new thread message
    // Initializes chain
    // Adds thread messages to chain
    // Starts chain
    // Adds assistant message to db
    // And stream progress using Server Sent Events format

    const currentThread = threadsState.find(
      (thread) => thread.public_id === threadId
    );
    const newThread = {
      public_id: threadId,
      messages: [userMessage],
      created_at: new Date(),
      project_id: currentThread?.project_id,
    };

    threadsDispatch({
      type: 'ADD_THREAD',
      payload: newThread,
    });

    let streamUrl = '';
    if (mode === AssistantMode.INTERNAL) {
      streamUrl = user
        ? `/api/threads/${threadId}?mode=${chatType}`
        : `/api/guest-threads/${threadId}/`;
    } else if (mode === AssistantMode.PUBLIC) {
      streamUrl = `/api/guest-threads/${threadId}/${organizationId}`;
    }

    if (!streamUrl) {
      throw new Error('Cannot create a stream');
    }

    const apiStream = await axios.post<ReadableStream>(streamUrl, data, {
      responseType: 'stream',
      adapter: 'fetch',
      headers: {
        Accept: 'text/event-stream',
      },
    });

    if (!apiStream.data) {
      throw new Error('Cannot read data from the stream');
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
      let bufferMessages = buffer.split('\n\n'); // Assuming messages are separated by double newlines
      buffer = bufferMessages.pop() || ''; // Keep the last incomplete message in the buffer

      for (const msg of bufferMessages) {
        // Process the value (which is a string)
        const message = parseSseString(msg);
        const messageEvent = message.event as ApiEvent;
        const messageData = message.data as ApiEventData;

        dispatch({
          type: SET_LOADING_TEXT,
          payload: tApiEvents(messageEvent), // not each events should be translated e.g. delta
        });

        if (messageEvent === 'delta') {
          const data = messageData as ApiSseMessageDelta;
          const textChunk = data.content;
          accumulatingMessage += textChunk;

          dispatch({
            type: APPEND_TO_STREAMED_MESSAGE,
            payload: { content: textChunk, run_id: runId },
          });

          if (accumulatingMessage.length % 20 === 0) {
            // scroll each 20 characters
            scrollFn();
          }
        } else if (messageEvent === 'final_response' && messageData) {
          const data = messageData as ApiSseMessageEvent;
          runId = data.run_id;
          if (accumulatingMessage.trim()) {
            dispatch({
              type: ADD_MESSAGE,
              payload: {
                public_id: data.id, // it's public id
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

          accumulatingMessage = '';
        } else if (messageEvent === 'error' && messageData) {
          // chain errors
          const data = messageData as Event & SseMessageError;

          const errorMessage = getErrorMessage(data, tChainErrors);
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
          errorToast({
            message: errorMessage || tChainErrors('unknown-error'),
          });

          logger.error('Stream error: %o', errorMessage);
        }
      }
    }
  } catch (error) {
    if (
      error instanceof AxiosError &&
      error.status === StatusCodes.BAD_REQUEST
    ) {
      dispatch({ type: SET_MESSAGE_ERROR, payload: true });
      errorToast({ message: 'sending-error' });
    }
    logger.error('Error submitting message: %o', error);
  }
};
