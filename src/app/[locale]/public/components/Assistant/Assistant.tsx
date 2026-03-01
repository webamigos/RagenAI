'use client';

import { ChatOutput } from '@/app/components/Assistant/ChatOutput';

import { usePublicAssistantLogic } from './usePublicAssistantLogic';
import { PromptForm } from '@/app/components/Assistant/PromptForm';
import { ChatResponseType } from '@/features/messages/contracts/message.types';

type Props = {
  threadId: string;
  accessToken: string;
};

export const PublicAssistant = ({ threadId, accessToken }: Props) => {
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
  } = usePublicAssistantLogic(threadId, accessToken);

  return (
    <div className="h-full flex flex-col font-sans">
      <div className="grow overflow-y-auto">
        <ChatOutput
          messages={messages}
          isLoading={isGlobalLoading}
          loadingMessage={messageLoadingText}
          streamedMessage={streamedMessage}
          isPublicAccess={isPublicAccess}
        />
        <div ref={messagesEndDivRef} />
      </div>
      <div className="shrink-0 w-full mb-8">
        {!isLocked() && threadId && (
          <PromptForm
            ref={promptFormRef}
            isUserLogged={false}
            isPublicAccess={isPublicAccess}
            isLoading={isGlobalLoading}
            onSubmit={onSubmit}
            responseType={ChatResponseType.TEXT}
          />
        )}
      </div>
    </div>
  );
};
