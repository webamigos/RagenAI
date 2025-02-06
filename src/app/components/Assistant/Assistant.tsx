'use client';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { LimitReached } from './ChatOutput/LimitReached';
import { useAssistantLogic } from './useAssistantLogic';
import { SearchThreads } from '../Sidebar/ThreadsHistory/SearchThreads';
import { VoiceMode } from './ChatOutput/VoiceMode/VoiceMode';

import { MessageContentType } from '@prisma/client';

type Props = {
  threadId: string;
};

export const Assistant = ({ threadId }: Props) => {
  const {
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
    isLocked,
    promptFormRef,
    isRecording,
    closeVoiceMode,
    handleVoiceResult,
    setVoiceMessageAsPlayed,
    apiEvent,
  } = useAssistantLogic(threadId);

  return (
    <>
      {isSearchOpen && (
        <>
          <div className="absolute inset-0 bg-primary-light dark:bg-primary-dark opacity-80 z-40" />
          <div
            className="absolute inset-0 flex items-center justify-center z-50"
            onClick={closeSearch}
          >
            <SearchThreads visitorId={userVisitorId!} ref={modalRef} />
          </div>
        </>
      )}

      <div className="h-full flex flex-col font-sans">
        {responseType === MessageContentType.VOICE && (
          <VoiceMode
            onClose={closeVoiceMode}
            isRecording={isRecording}
            onResult={handleVoiceResult}
            messages={messages}
            onMessagePlayed={setVoiceMessageAsPlayed}
          />
        )}
        <div className="flex-grow overflow-y-auto">
          <ChatOutput
            responseType={responseType}
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
              handleResponseType={handleResponseType}
              ref={promptFormRef}
              isUserLogged={!!isSignedIn}
              isLoading={isGlobalLoading}
              onSubmit={onSubmit}
              isPublicAccess={isPublicAccess}
            />
          )}
        </div>
      </div>
    </>
  );
};
