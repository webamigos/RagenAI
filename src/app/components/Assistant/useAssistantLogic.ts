import { useEffect, useRef, startTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Role, MessageContentType } from '@prisma/client';
import { useUser } from '@clerk/nextjs';
import { type UserResource } from '@clerk/types';
import { useDispatch } from 'react-redux';
import { setRecording } from '@/store/voice/voiceSlice';
import {
  setMessages,
  setInitialLoad,
  setMode,
  setResponseType,
  setMessagePlayed,
  setError,
} from '@/store/assistant/assistantSlice';
import { useAppSelector } from '@/store/hooks';
import { useRouter, usePathname } from '@/i18n/routing';
import { LOCAL_STORAGE_THREAD_KEY } from '../config';
import { useApi } from '../../hooks/useApi';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import { fetchMessagesFromApi } from '../../lib/services/api';
import {
  ChatType,
  type CreateMessageDto,
  ChatResponseType,
} from '../../contracts/Message';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';
import { PromptFormRef } from './PromptForm/PromptForm';
import { handleAssistantStream } from './handle-assistant-stream';
import { AssistantMode } from '@/app/contracts/Assistant';

const { errorToast } = statusToast();

const modeMap: Record<string, ChatType> = {
  conversation: ChatType.CONVERSATION,
  rag: ChatType.RAG,
};

export const useAssistantLogic = (threadId: string) => {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const { isSearchOpen, modalRef, closeSearch } = useSearchThreads();
  const dispatch = useDispatch();

  const {
    messages,
    isLoading: isMessageLoading,
    userMessageId,
    isLimitLock,
    messageLoadingText,
    streamedMessage,
    error: isError,
    mode,
    responseType,
  } = useAppSelector((state) => state.assistant);
  const { userThreads } = useAppSelector((state) => state.threads);

  const userVisitorId = user?.id;
  const messagesEndDivRef = useRef<HTMLDivElement>(null);
  const promptFormRef = useRef<PromptFormRef>(null);

  const t = useTranslations('Index');
  const tChainErrors = useTranslations('chain-errors');
  const tApiEvents = useTranslations('api-events');

  const isPublicAccess = pathname.includes('/public');

  const { isLoading: apiLoading } = useApi(() => {
    return userVisitorId
      ? fetchMessagesFromApi(threadId, userVisitorId)
      : Promise.resolve(null);
  });

  const isGlobalLoading = !isError && (isMessageLoading || apiLoading);

  const scrollToBottom = () =>
    messagesEndDivRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchData = async () => {
    if (!userVisitorId) {
      startTransition(() => router.push('/sign-in'));
      return;
    }

    dispatch(setInitialLoad(true));
    try {
      const response = await fetchMessagesFromApi(threadId, userVisitorId);
      if (response) {
        dispatch(setInitialLoad(false));
        dispatch(setMessages(response.data));
      }
    } catch (error) {
      logger.error('Error fetching messages: %o', error);
      dispatch(setError('Error fetching messages'));
    }
  };

  const handleInitialMessage = () => {
    const initialMessageKey = `thread_${threadId}_initial_message`;
    const initialMessage = localStorage.getItem(initialMessageKey);
    const initialMessageType = sessionStorage.getItem(
      'initial_message_type'
    ) as MessageContentType;

    if (initialMessage) {
      localStorage.removeItem(initialMessageKey);
      sessionStorage.removeItem('initial_message_type');

      onSubmit({
        prompt: initialMessage,
        mode: ChatType.CONVERSATION,
        messageType: initialMessageType || MessageContentType.TEXT,
        voiceDurationSeconds: 0,
      });
    }
  };

  // TODO: use similar logic for useAssistantLogic and usePublicAssistantLogic
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
      message_type: data.messageType,
      voice_duration_seconds: data.voiceDurationSeconds,
      voice_played: false,
    };
    // Cast to unknown first to avoid type mismatch
    // ugly workaround to satisfied Clerk UserResourceTypes

    dispatch(
      setMode(modeMap[data.mode as keyof typeof modeMap] ?? ChatType.RAG)
    );

    try {
      await handleAssistantStream({
        mode: AssistantMode.INTERNAL,
        messages,
        userMessageId,
        userMessage,
        t,
        tChainErrors,
        tApiEvents,
        threadId,
        responseType,
        streamedMessage,
        threadsState: userThreads,
        scrollFn: scrollToBottom,
        errorToast,
        promptFormRef,
        data,
        chatType:
          data.mode === 'conversation' ? ChatType.CONVERSATION : ChatType.RAG,
        user: user as unknown as UserResource,
        reduxDispatch: dispatch,
      });
    } catch {
      errorToast({ message: 'sending-error' });
    }
  };

  const handleResponseType = () => {
    dispatch(setResponseType(ChatResponseType.VOICE));
    dispatch(setRecording(true));
  };

  const closeVoiceMode = () => {
    dispatch(setRecording(false));
    dispatch(setResponseType(ChatResponseType.TEXT));
  };

  const handleVoiceResult = (text: string, recordingTime: number) => {
    onSubmit({
      mode,
      prompt: text,
      messageType: 'VOICE',
      voiceDurationSeconds: recordingTime,
    });
  };

  const setVoiceMessageAsPlayed = async (messageId: string) => {
    try {
      dispatch(setMessagePlayed(messageId));
    } catch (error) {
      logger.error('Error marking message as played: %o', error);
    }
  };
  useEffect(() => {
    if (isLoaded && userVisitorId) {
      fetchData();
      const initialMessage = localStorage.getItem(
        `thread_${threadId}_initial_message`
      );
      if (initialMessage) {
        onSubmit({ prompt: initialMessage, messageType: 'TEXT' });
      }
      localStorage.removeItem(`thread_${threadId}_initial_message`);
    }
  }, [isLoaded, userVisitorId]);

  useEffect(() => {
    if (!localStorage.getItem(LOCAL_STORAGE_THREAD_KEY)) {
      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
    }
  }, [threadId]);

  useEffect(() => {
    handleInitialMessage();
  }, [threadId]);

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
    isLocked: () => !isSignedIn && isLimitLock,
    promptFormRef,
    closeVoiceMode,
    setVoiceMessageAsPlayed,
    handleVoiceResult,
  };
};
