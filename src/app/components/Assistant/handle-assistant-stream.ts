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

const handleStreamError = async ({
  lastUserMessageId,
  userMessage,
  messages,
  promptFormRef,
  errorMessage,
  tChainErrors,
  errorToast,
  reduxDispatch,
}: {
  lastUserMessageId: string | null;
  userMessage: MessageDto;
  messages: MessageDto[];
  promptFormRef: RefObject<PromptFormRef>;
  errorMessage: string | null;
  tChainErrors: TranslationFn;
  errorToast: ({ message, position, autoClose }: ToastProps) => void;
  reduxDispatch: AppDispatch;
}) => {
  try {
    if (lastUserMessageId) {
      await deleteUserMessage(lastUserMessageId);
    }

    const updatedMessages = messages.filter(
      (message) =>
        message.public_id !== (lastUserMessageId || userMessage.public_id)
    );
    reduxDispatch(setMessages(updatedMessages));
    promptFormRef.current?.reset(userMessage.content || '');

    errorToast({
      message: errorMessage || tChainErrors('unknown-error'),
    });
    reduxDispatch(setError(errorMessage));
    reduxDispatch(setLoading(false));
    reduxDispatch(setMessageLoadingText(''));
  } catch (error) {
    logger.error('Error removing message: %o', error);
    handleStreamError({
      lastUserMessageId: null,
      userMessage,
      messages,
      promptFormRef,
      errorMessage,
      tChainErrors,
      errorToast,
      reduxDispatch,
    });
  }
};

const getStreamUrl = (
  mode: AssistantMode,
  threadId: string,
  chatType?: ChatType,
  user?: UserResource,
  organizationId?: string
): string => {
  if (mode === AssistantMode.INTERNAL) {
    return user
      ? `/api/threads/${threadId}?mode=${chatType}`
      : `/api/guest-threads/${threadId}/`;
  }
  if (mode === AssistantMode.PUBLIC) {
    return `/api/guest-threads/${threadId}/${organizationId}`;
  }
  throw new Error('Cannot create a stream');
};

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
    const streamUrl = getStreamUrl(
      mode,
      threadId,
      chatType,
      user || undefined,
      organizationId
    );
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

        switch (messageEvent) {
          case 'user_message_created':
            if (messageData) {
              const { id } = messageData as { id: string };
              lastUserMessageId = id;
              reduxDispatch(
                setMessages([...messages, { ...userMessage, public_id: id }])
              );
            }
            break;

          case 'delta':
            const { content: textChunk } = messageData as ApiSseMessageDelta;
            accumulatingMessage += textChunk;
            reduxDispatch(
              setStreamedMessage({
                content: accumulatingMessage,
                runId,
                created_at: new Date().toISOString(),
              })
            );
            if (accumulatingMessage.length % 100 === 0) {
              scrollFn();
            }
            break;

          case 'final_response':
            if (messageData) {
              const { id, role, run_id } = messageData as ApiSseMessageEvent;
              runId = run_id;
              const finalMessage = {
                public_id: id,
                role,
                content: accumulatingMessage,
                created_at: new Date().toISOString(),
                run_id: runId,
                message_type: responseType,
              };

              const effectiveUserMessage = lastUserMessageId
                ? { ...userMessage, public_id: lastUserMessageId }
                : userMessage;

              const uniqueMessages = [
                ...messages,
                effectiveUserMessage,
                finalMessage,
              ].filter(
                (message, index, self) =>
                  index ===
                  self.findIndex((m) => m.public_id === message.public_id)
              );

              reduxDispatch(setMessages(uniqueMessages));
              reduxDispatch(setStreamedMessage(null));
              reduxDispatch(setLoading(false));
              scrollFn();
              accumulatingMessage = '';
            }
            break;

          case 'error':
            if (messageData) {
              const errorMessage = getErrorMessage(
                messageData as SseMessageError,
                tChainErrors
              );
              if (!errorMessage && !streamedMessage) {
                return;
              }

              await handleStreamError({
                lastUserMessageId,
                userMessage,
                messages,
                promptFormRef,
                errorMessage,
                tChainErrors,
                errorToast,
                reduxDispatch,
              });
              return;
            }
            break;
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
