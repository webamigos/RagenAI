'use client';

import { useSearchParams } from 'next/navigation';
import { ChatOutput } from '@/app/components/Assistant/ChatOutput';
import { useEffect, useRef } from 'react';

import { usePublicAssistantLogic } from './usePublicAssistantLogic';
import { PromptForm } from '@/app/components/Assistant/PromptForm';
import { reducerActions } from './types';

type Props = {
  threadId: string;
  organizationId: string;
  initialPrompt?: string | null;
};

export const PublicAssistant = ({ threadId, organizationId }: Props) => {
  const {
    messageLoadingText,
    messagesEndDivRef,
    isGlobalLoading,
    streamedMessage,
    messages,
    isPublicAccess,
    onSubmit,
    isLocked,
    promptFormRef,
    userMessageId,
    dispatch,
    processedMessages,
  } = usePublicAssistantLogic(threadId, organizationId);

  const searchParams = useSearchParams();
  const initialMessageId = searchParams.get('msg');

  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messageExists = messages.some(
      (msg) => msg.public_id === initialMessageId
    );

    if (
      initialMessageId &&
      !userMessageId &&
      !messageExists &&
      !processedMessages.includes(initialMessageId)
    ) {
      dispatch({
        type: reducerActions.SET_MESSAGE_ID,
        payload: initialMessageId,
      });
    }
  }, [initialMessageId, userMessageId, messages, processedMessages]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, []);

  return (
    <div className="h-full flex flex-col font-sans min-h-screen relative">
      <div
        ref={chatContainerRef}
        className="flex-grow overflow-y-auto pb-[72px]"
      >
        <ChatOutput
          messages={messages}
          isLoading={isGlobalLoading}
          loadingMessage={messageLoadingText}
          streamedMessage={streamedMessage}
          widgetMode={true}
        />
        <div ref={messagesEndDivRef} />
      </div>

      {!isLocked() && threadId && (
        <div className="absolute inset-x-0 bottom-0 w-full mb-8">
          <PromptForm
            ref={promptFormRef}
            isUserLogged={false}
            isPublicAccess={isPublicAccess}
            isLoading={isGlobalLoading}
            onSubmit={onSubmit}
          />
        </div>
      )}
    </div>
  );
};
