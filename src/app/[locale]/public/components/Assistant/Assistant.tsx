'use client';

import { useSearchParams } from 'next/navigation';
import { ChatOutput } from '@/app/components/Assistant/ChatOutput';
import { useEffect } from 'react';

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
  } = usePublicAssistantLogic(threadId, organizationId);

  const searchParams = useSearchParams();
  const initialMessageId = searchParams.get('msg');

  useEffect(() => {
    const messageExists = messages.some(
      (msg) => msg.public_id === initialMessageId
    );

    if (initialMessageId && !userMessageId && !messageExists) {
      dispatch({
        type: reducerActions.SET_MESSAGE_ID,
        payload: initialMessageId,
      });
    }
  }, [initialMessageId, userMessageId, messages]);

  return (
    <div className="h-full flex flex-col font-sans">
      <div className="flex-grow overflow-y-auto">
        <ChatOutput
          messages={messages}
          isLoading={isGlobalLoading}
          loadingMessage={messageLoadingText}
          streamedMessage={streamedMessage}
          widgetMode={true}
          isPublicAccess={isPublicAccess}
        />
        <div ref={messagesEndDivRef} />
      </div>
      <div className="flex-shrink-0 w-full mb-8">
        {!isLocked() && threadId && (
          <PromptForm
            ref={promptFormRef}
            isUserLogged={false}
            isPublicAccess={isPublicAccess}
            isLoading={isGlobalLoading}
            onSubmit={onSubmit}
          />
        )}
      </div>
    </div>
  );
};
