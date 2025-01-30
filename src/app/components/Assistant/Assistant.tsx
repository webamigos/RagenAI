'use client';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { LimitReached } from './ChatOutput/LimitReached';
import { useAssistantLogic } from './useAssistantLogic';
import { SearchThreads } from '../Sidebar/ThreadsHistory/SearchThreads';
import { VoiceMode } from './ChatOutput/VoiceMode/VoiceMode';
import { ChatType } from '@/app/contracts/Message';

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
  } = useAssistantLogic(threadId);

  const handleVoiceResult = (text: string, recordingTime: number) => {
    onSubmit({
      prompt: text,
      mode: ChatType.CONVERSATION,
      messageType: 'VOICE',
      voiceDurationSeconds: recordingTime,
    });
  };

  return (
    <>
      {isSearchOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          onClick={closeSearch}
        >
          <SearchThreads visitorId={userVisitorId!} ref={modalRef} />
        </div>
      )}

      <div className="h-full flex flex-col font-sans">
        {responseType === 'voice' && (
          <VoiceMode
            onClose={closeVoiceMode}
            isRecording={isRecording}
            onResult={handleVoiceResult}
            messages={messages}
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
            />
          )}
        </div>
      </div>
    </>
  );
};
