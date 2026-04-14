'use client';

import { type RefObject } from 'react';

import {
  type ApiSseMessageDelta,
  type ApiSseMessageEvent,
  type ApiSseReasoningDelta,
  type ApiSseToolApprovalRequest,
  type SseMessageError,
} from '@/features/threads/contracts/events.types';

import { type Thread } from '@/generated/prisma/browser';
import {
  type ChatResponseType,
  type ChatType,
  type CreateMessageDto,
  type MessageDto,
  type StreamedMessageDto,
} from '@/features/messages/contracts/message.types';
import { type ThreadHistoryResponse } from '@/features/threads/contracts/thread.types';
import axios, { AxiosError } from 'axios';
import {
  type ApiEvent,
  type ApiEventData,
  parseSseString,
} from '@/libs/sse/prepare-sse-message';

// Better Auth user type (simplified)
type User = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
};
import { deleteUserMessage } from '@/app/actions';
import { logger } from '@/app/lib/utils/logger';
import { type ToastProps } from '@/app/lib/utils/toast';
import { type PromptFormRef } from './PromptForm/PromptForm';
import { AssistantMode } from '@/features/assistants/contracts/assistant.types';
import { StatusCodes } from 'http-status-codes';
import { type TranslationFn } from './types';
import { getErrorMessage } from './utils';
import { type AppDispatch } from '@/store';
import {
  setMessages,
  setStreamedMessage,
  setError,
  setLoading,
  setMessageLoadingText,
  setUserMessageId,
} from '@/store/assistant/assistantSlice';
import {
  setPendingApproval,
  clearPendingApproval,
} from '@/store/tool-approvals/toolApprovalsSlice';

type CommonConfig = {
  messages: MessageDto[];
  userMessage: MessageDto;
  userMessageId: string;
  t: TranslationFn;
  tChainErrors: TranslationFn;
  tApiEvents: TranslationFn;
  threadId: Thread['id'];
  responseType: ChatResponseType;
  data: CreateMessageDto;
  scrollFn: () => void;
  streamedMessage: StreamedMessageDto | null;
  errorToast: ({ message }: ToastProps) => void;
  promptFormRef: RefObject<PromptFormRef | null>;
  organizationId?: string;
  chatType?: ChatType;
  reduxDispatch: AppDispatch;
};

type HandleAssistantStreamConfig = {
  mode: AssistantMode;
  user?: User | undefined | null;
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
  promptFormRef: RefObject<PromptFormRef | null>;
  errorMessage: string | null;
  tChainErrors: TranslationFn;
  errorToast: ({ message }: ToastProps) => void;
  reduxDispatch: AppDispatch;
}) => {
  try {
    if (lastUserMessageId) {
      await deleteUserMessage(lastUserMessageId);
    }

    const updatedMessages = messages.filter(
      (message) => message.id !== (lastUserMessageId || userMessage.id),
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
  user?: User,
  organizationId?: string,
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
  // Any pending tool approval from a previous turn is resolved the
  // moment the user submits a new one (approve, deny, or brand-new
  // message) — the paused toolCallId from that earlier turn can no
  // longer be honored.
  reduxDispatch(clearPendingApproval({ threadId }));

  try {
    const streamUrl = getStreamUrl(
      mode,
      threadId,
      chatType,
      user || undefined,
      organizationId,
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
    let accumulatingReasoning = '';
    let isCurrentlyReasoning = false;
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
                setMessages([...messages, { ...userMessage, id: id }]),
              );
            }
            break;

          case 'reasoning_start':
            isCurrentlyReasoning = true;
            reduxDispatch(
              setStreamedMessage({
                content: accumulatingMessage,
                runId,
                createdAt: new Date().toISOString(),
                reasoningContent: accumulatingReasoning,
                isReasoning: true,
              }),
            );
            break;

          case 'reasoning_delta': {
            const { content: reasoningChunk } =
              messageData as ApiSseReasoningDelta;
            accumulatingReasoning += reasoningChunk;
            reduxDispatch(
              setStreamedMessage({
                content: accumulatingMessage,
                runId,
                createdAt: new Date().toISOString(),
                reasoningContent: accumulatingReasoning,
                isReasoning: true,
              }),
            );
            if (accumulatingReasoning.length % 100 === 0) {
              scrollFn();
            }
            break;
          }

          case 'reasoning_end':
            isCurrentlyReasoning = false;
            reduxDispatch(
              setStreamedMessage({
                content: accumulatingMessage,
                runId,
                createdAt: new Date().toISOString(),
                reasoningContent: accumulatingReasoning,
                isReasoning: false,
              }),
            );
            break;

          case 'delta': {
            const { content: textChunk } = messageData as ApiSseMessageDelta;
            accumulatingMessage += textChunk;
            reduxDispatch(
              setStreamedMessage({
                content: accumulatingMessage,
                runId,
                createdAt: new Date().toISOString(),
                reasoningContent: accumulatingReasoning || undefined,
                isReasoning: isCurrentlyReasoning,
              }),
            );
            if (accumulatingMessage.length % 100 === 0) {
              scrollFn();
            }
            break;
          }

          case 'final_response':
            if (messageData) {
              const {
                id,
                role,
                runId: messageRunId,
              } = messageData as ApiSseMessageEvent;
              runId = messageRunId;
              const finalMessage = {
                id: id,
                role,
                content: accumulatingMessage,
                createdAt: new Date().toISOString(),
                runId: messageRunId,
                messageType: responseType,
              };

              const effectiveUserMessage = lastUserMessageId
                ? { ...userMessage, id: lastUserMessageId }
                : userMessage;

              const uniqueMessages = [
                ...messages,
                effectiveUserMessage,
                finalMessage,
              ].filter(
                (message, index, self) =>
                  index === self.findIndex((m) => m.id === message.id),
              );

              reduxDispatch(setMessages(uniqueMessages));
              reduxDispatch(setStreamedMessage(null));
              reduxDispatch(setLoading(false));
              scrollFn();
              accumulatingMessage = '';
            }
            break;

          case 'tool_approval_request':
            // Phase 2b — the SDK paused a write tool because RAG
            // context is present in this turn. Store the pending
            // approval in Redux so ToolConfirmationCard can render it
            // inline in the paused assistant message. The explanation
            // text rides via `delta` (same path as regular assistant
            // content), so no UI gap is visible here.
            if (messageData) {
              const approvalData = messageData as ApiSseToolApprovalRequest;
              reduxDispatch(
                setPendingApproval({
                  threadId,
                  approval: {
                    approvalId: approvalData.approvalId,
                    toolCallId: approvalData.toolCallId,
                    toolName: approvalData.toolName,
                    provider: approvalData.provider,
                    createdAt: new Date().toISOString(),
                  },
                }),
              );
            }
            break;

          case 'error':
            if (messageData) {
              const errorMessage = getErrorMessage(
                messageData as SseMessageError,
                tChainErrors,
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
