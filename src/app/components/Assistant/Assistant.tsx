'use client';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { LimitReached } from './ChatOutput/LimitReached';
import { useAssistantLogic } from './useAssistantLogic';
import { SearchThreads } from '../Sidebar/ThreadsHistory/SearchThreads';
import { VoiceMode } from './ChatOutput/VoiceMode/VoiceMode';
import { ProjectContextIndicator } from './ProjectContextIndicator';

import { useOrganization, useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { fetchVoiceId } from '@/app/components/MyProfile/ChatInstanceSettings/actions';
import { ChatResponseType } from '@/app/contracts/Message';
import { useDispatch, useSelector } from 'react-redux';
import { logger } from '@/app/lib/utils/logger';
import { setVoiceId, setRecording } from '@/store/voice/voiceSlice';
import { RootState } from '@/store';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';

type ProjectForContext = {
  id: number;
  public_id: string;
  title: string;
};

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
    messages: localMessages,
    onSubmit,
    isLocked,
    promptFormRef,
    closeVoiceMode,
    setVoiceMessageAsPlayed,
    handleVoiceResult,
  } = useAssistantLogic(threadId);

  const { messages: reduxMessages, error: assistantError } = useSelector(
    (state: RootState) => state.assistant
  );

  const messages = reduxMessages.length > 0 ? reduxMessages : localMessages;

  const { organization } = useOrganization();
  const { user } = useUser();
  const dispatch = useDispatch();
  const { voiceId, isRecording } = useSelector(
    (state: RootState) => state.assistant.voice
  );
  const [availableProjects, setAvailableProjects] = useState<
    ProjectForContext[]
  >([]);

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

  useEffect(() => {
    const fetchAvailableProjects = async () => {
      if (!organization?.id || !user?.id) {
        return;
      }

      try {
        const response = await getProjects(organization.id, user.id);
        if (response.projects) {
          const mappedProjects: ProjectForContext[] = response.projects.map(
            (project) => ({
              id: project.id,
              public_id: project.public_id,
              title: project.title,
            })
          );

          setAvailableProjects(mappedProjects);
        }
      } catch (error) {
        logger.error({ error: error }, 'Error fetching available projects');
      }
    };

    fetchAvailableProjects();
  }, [organization?.id, user?.id]);

  return (
    <>
      {isSearchOpen && (
        <div onClick={closeSearch}>
          <SearchThreads visitorId={userVisitorId!} />
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
            assistantError={assistantError}
          />
        )}
        <div className="grow overflow-y-auto my-14 md:my-0 pb-20 md:pb-24">
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

        <div className="fixed top-16 right-4 md:top-6 md:right-6 z-50">
          <ProjectContextIndicator
            threadId={threadId}
            availableProjects={availableProjects}
          />
        </div>

        <div className="shrink-0 w-full fixed bottom-0 left-0 lg:left-64 right-0 z-40 border-t border-gray-200 dark:border-gray-700">
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
