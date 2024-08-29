'use client';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { LimitReached } from './ChatOutput/LimitReached';
import { useAssistantLogic } from './useAssistantLogic';

type Props = {
  threadId: string;
};

export const Assistant = ({ threadId }: Props) => {
  const {
    messageLoadingText,
    messagesEndDivRef,
    isGlobalLoading,
    streamedMessage,
    isLimitLock,
    isSignedIn,
    messages,
    handleCloseThread,
    onSubmit,
    isLocked,
  } = useAssistantLogic(threadId);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-grow overflow-y-auto">
        <ChatOutput
          messages={messages}
          isLoading={isGlobalLoading}
          loadingMessage={messageLoadingText}
          streamedMessage={streamedMessage}
        />
        <div ref={messagesEndDivRef} />
      </div>

      <div className="flex-shrink-0 w-full">
        {isLimitLock && !isSignedIn && <LimitReached />}
        {!isLocked() && threadId && (
          <PromptForm
            isUserLogged={!!isSignedIn}
            handleCloseThread={handleCloseThread}
            isLoading={isGlobalLoading}
            onSubmit={onSubmit}
          />
        )}
      </div>
    </div>
  );
};
