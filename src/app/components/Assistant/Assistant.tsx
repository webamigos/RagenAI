'use client';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { LimitReached } from './ChatOutput/LimitReached';
import { useAssistantLogic } from './useAssistantLogic';
import { SearchThreads } from '../Sidebar/ThreadsHistory/SearchThreads';
import { VoiceMode } from './ChatOutput/VoiceMode/VoiceMode';

import { useOrganization } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { fetchVoiceId } from '@/app/components/MyProfile/ChatInstanceSettings/actions';
import { ChatResponseType } from '@/app/contracts/Message';
import { reducerActions } from './reducer';
import { useDispatch, useSelector } from 'react-redux';
import { setVoiceId, setRecording } from '@/store/features/voice/voiceSlice';
import { RootState } from '@/store';

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
    dispatch: assistantDispatch,
    promptFormRef,
    closeVoiceMode,
    setVoiceMessageAsPlayed,
    handleVoiceResult,
  } = useAssistantLogic(threadId);

  const { organization } = useOrganization();
  const dispatch = useDispatch();
  const { voiceId, isRecording } = useSelector(
    (state: RootState) => state.voice
  );

  useEffect(() => {
    const getVoiceSettings = async () => {
      if (organization?.id) {
        const response = await fetchVoiceId(organization.id);
        if (response.success && response.data?.voiceId) {
          dispatch(setVoiceId(response.data.voiceId));
        }
      }
    };
    getVoiceSettings();
  }, [organization?.id, dispatch]);

  useEffect(() => {
    const wasVoiceModeActive = sessionStorage.getItem('voice_mode_active');
    const responseTypeStored = sessionStorage.getItem('response_type');

    if (
      wasVoiceModeActive === 'true' &&
      responseTypeStored === ChatResponseType.VOICE
    ) {
      dispatch(setRecording(true));
      handleResponseType();
      sessionStorage.removeItem('voice_mode_active');
      sessionStorage.removeItem('response_type');
    }
  }, []);

  return (
    <>
      {isSearchOpen && (
        <div onClick={closeSearch}>
          <SearchThreads ref={modalRef} visitorId={userVisitorId!} />
        </div>
      )}

      <div className="h-full flex flex-col font-sans">
        {responseType === ChatResponseType.VOICE && (
          <VoiceMode
            onClose={closeVoiceMode}
            isRecording={isRecording}
            onResult={handleVoiceResult}
            messages={messages}
            onMessagePlayed={setVoiceMessageAsPlayed}
            voiceId={voiceId}
          />
        )}
        <div className="flex-grow overflow-y-auto">
          <ChatOutput
            responseType={responseType}
            messages={messages}
            isLoading={isGlobalLoading}
            loadingMessage={messageLoadingText}
            streamedMessage={streamedMessage}
            isPublicAccess={isPublicAccess}
            voiceId={voiceId}
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
              responseType={responseType}
            />
          )}
        </div>
      </div>
    </>
  );
};
