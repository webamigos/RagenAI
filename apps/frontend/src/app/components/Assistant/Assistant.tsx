'use client';
//Server component?

import { ChatOutput } from './ChatOutput/ChatOutput';
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
    <>
      <div className="flex-grow overflow-y-auto">
        <ChatOutput
          messages={messages}
          isLoading={isGlobalLoading}
          loadingMessage={messageLoadingText}
          streamedMessage={streamedMessage}
        />
        <div ref={messagesEndDivRef} />
      </div>
      {isLimitLock && !isSignedIn && <LimitReached />}
      {!isLocked() && threadId && (
        <PromptForm
          isUserLogged={!!isSignedIn}
          handleCloseThread={handleCloseThread}
          isLoading={isGlobalLoading}
          onSubmit={onSubmit}
        />
      )}
    </>
  );
};
