'use client';

import { RefObject } from 'react';

import {
  ApiSseMessageDelta,
  ApiSseMessageEvent,
  SseMessageError,
} from '@/app/contracts/Events';

import { Thread } from '@prisma/client';
import {
  ChatResponseType,
  ChatType,
  CreateMessageDto,
  MessageDto,
  StreamedMessageDto,
  ThreadHistoryResponse,
} from '@/app/contracts/Message';
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
import { type TranslationFn } from './types';
import { getErrorMessage } from './utils';
import { AppDispatch } from '@/store';
import {
  setMessages,
  setStreamedMessage,
  setError,
  setLoading,
  setMessageLoadingText,
  setUserMessageId,
} from '@/store/assistant/assistantSlice';

type CommonConfig = {
  messages: MessageDto[];
  userMessage: MessageDto;
  userMessageId: string;
  t: TranslationFn;
  tChainErrors: TranslationFn;
  tApiEvents: TranslationFn;
  threadId: Thread['public_id'];
  responseType: ChatResponseType;
  data: CreateMessageDto;
  scrollFn: () => void;
  streamedMessage: StreamedMessageDto | null;
  errorToast: ({ message, position, autoClose }: ToastProps) => void;
  promptFormRef: RefObject<PromptFormRef>;
  organizationId?: string;
  chatType?: ChatType;
  reduxDispatch: AppDispatch;
};

type HandleAssistantStreamConfig = {
  mode: AssistantMode;
  user?: UserResource | undefined | null;
  organizationId?: string;
  threadsState?: ThreadHistoryResponse[];
} & CommonConfig;

export const handleAssistantStream = async ({
  mode,
  organizationId,
  messages,
  userMessage,
  userMessageId,
  t,
  tChainErrors,
  tApiEvents,
  threadId,
  responseType,
  data,
  scrollFn,
  streamedMessage,
  errorToast,
  promptFormRef,
  chatType,
  user,
  reduxDispatch,
}: HandleAssistantStreamConfig) => {
  // This flow:
  // Creates new thread message
  // Initializes chain
  // Adds thread messages to chain
  // Starts chain
  // Adds assistant message to db
  // And stream progress using Server Sent Events format
  reduxDispatch(setError(null));
  reduxDispatch(setLoading(true));
  reduxDispatch(setMessageLoadingText(t('status-thinking')));
  reduxDispatch(setStreamedMessage(null));
  reduxDispatch(setUserMessageId(userMessageId));

  try {
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
    let runId: string = '';
    let lastUserMessageId: string | null = null;

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
        const messageData = message.data as ApiEventData | SseMessageError;

        reduxDispatch(setMessageLoadingText(tApiEvents(messageEvent))); // not each events should be translated e.g. delta

        if (messageEvent === 'user_message_created' && messageData) {
          const data = messageData as { id: string };
          lastUserMessageId = data.id;
          const updatedUserMessage = { ...userMessage, public_id: data.id };
          reduxDispatch(setMessages([...messages, updatedUserMessage]));
        } else if (messageEvent === 'delta') {
          const data = messageData as ApiSseMessageDelta;
          const textChunk = data.content;
          accumulatingMessage += textChunk;

          reduxDispatch(
            setStreamedMessage({
              content: accumulatingMessage,
              runId: runId,
              created_at: new Date().toISOString(),
            })
          );

          if (accumulatingMessage.length % 20 === 0) {
            // scroll each 20 characters
            scrollFn();
          }
        } else if (messageEvent === 'final_response' && messageData) {
          const data = messageData as ApiSseMessageEvent;
          runId = data.run_id;

          const finalMessage = {
            public_id: data.id, // it's public id
            role: data.role,
            content: accumulatingMessage,
            created_at: new Date(), // FIXME: resolved in DEV-78
            run_id: runId,
            message_type: responseType,
          };

          const effectiveUserMessage = lastUserMessageId
            ? { ...userMessage, public_id: lastUserMessageId }
            : userMessage;

          const updatedMessages = [
            ...messages,
            effectiveUserMessage,
            finalMessage,
          ];
          const uniqueMessages = updatedMessages.filter(
            (message, index, self) =>
              index === self.findIndex((m) => m.public_id === message.public_id)
          );
          reduxDispatch(setMessages(uniqueMessages));
          reduxDispatch(setStreamedMessage(null));
          reduxDispatch(setLoading(false));

          accumulatingMessage = '';
        } else if (messageEvent === 'error' && messageData) {
          // chain errors
          const data = messageData as SseMessageError;
          const errorMessage = getErrorMessage(data, tChainErrors);
          const shouldIgnoreError = !errorMessage && !streamedMessage;

          if (shouldIgnoreError) {
            return;
          }

          try {
            if (lastUserMessageId) {
              // move to backend after refactoring message handling
              await deleteUserMessage(lastUserMessageId);
            }

            const updatedMessages = messages.filter(
              (message) =>
                message.public_id !==
                (lastUserMessageId || userMessage.public_id)
            );
            reduxDispatch(setMessages(updatedMessages));
            promptFormRef.current?.reset(userMessage.content || '');

            errorToast({
              message: errorMessage || tChainErrors('unknown-error'),
            });

            reduxDispatch(setError(null));
            reduxDispatch(setLoading(false));
            reduxDispatch(setMessageLoadingText(''));

            logger.error('Stream error: %o', errorMessage);

            return;
          } catch (error) {
            logger.error('Error removing message: %o', error);

            const updatedMessages = messages.filter(
              (message) =>
                message.public_id !==
                (lastUserMessageId || userMessage.public_id)
            );
            reduxDispatch(setMessages(updatedMessages));
            promptFormRef.current?.reset(userMessage.content || '');

            errorToast({
              message: errorMessage || tChainErrors('unknown-error'),
            });

            reduxDispatch(setLoading(false));
            reduxDispatch(setMessageLoadingText(''));
            return;
          }
        }
      }
    }
  } catch (error) {
    if (
      error instanceof AxiosError &&
      error.status === StatusCodes.BAD_REQUEST
    ) {
      reduxDispatch(setError('Error submitting message'));
      errorToast({ message: 'sending-error' });
    }
    logger.error('Error submitting message: %o', error);
  }
};
