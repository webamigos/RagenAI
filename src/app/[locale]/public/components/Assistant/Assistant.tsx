'use client';

import { ChatOutput } from '@/app/components/Assistant/ChatOutput';

import { usePublicAssistantLogic } from './usePublicAssistantLogic';
import { PromptForm } from '@/app/components/Assistant/PromptForm';
import { ChatResponseType } from '@/app/contracts/Message';

type Props = {
  threadId: string;
  organizationId: string;
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
  } = usePublicAssistantLogic(threadId, organizationId);

  return (
    <div className="h-full flex flex-col font-sans">
      <div className="flex-grow overflow-y-auto">
        <ChatOutput
          messages={messages}
          isLoading={isGlobalLoading}
          loadingMessage={messageLoadingText}
          streamedMessage={streamedMessage}
          widgetMode={true}
          responseType={ChatResponseType.TEXT}
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
