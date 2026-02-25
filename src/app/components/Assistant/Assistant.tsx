'use client';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { LimitReached } from './ChatOutput/LimitReached';
import { useAssistantLogic } from './useAssistantLogic';
import { SearchThreads } from '../Sidebar/ThreadsHistory/SearchThreads';
import { VoiceMode } from './ChatOutput/VoiceMode/VoiceMode';
import { ProjectContextIndicator } from './ProjectContextIndicator';
import { BreadcrumbNavigation } from '../BreadcrumbNavigation';
import { ModelSelector } from './ModelSelector';

import { useOrganization, useUser } from '@/app/hooks/use-auth';
import { useEffect, useState } from 'react';
import { fetchVoiceId } from '@/app/components/MyProfile/ChatInstanceSettings/actions';
import { ChatResponseType } from '@/features/messages/contracts/message.types';
import { useDispatch, useSelector } from 'react-redux';
import { logger } from '@/app/lib/utils/logger';
import { setVoiceId, setRecording } from '@/store/voice/voiceSlice';
import { RootState } from '@/store';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';
import { updateThreadModel } from '@/app/lib/actions/updateThreadModel';
import { getOrganizationSettings } from '@/app/lib/actions/getOrganizationSettings';
import { getThreadDetailsAction } from '@/app/lib/actions/threads';
import { updateThreadModel as updateThreadModelAction } from '@/store/threads/threadsSlice';
import { updateThreadModel as updateSidebarThreadModelAction } from '@/store/sidebar/sidebarSlice';

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
  const [currentThreadModel, setCurrentThreadModel] = useState<string | null>(
    null
  );
  const [organizationDefaultModel, setOrganizationDefaultModel] = useState<
    string | null
  >(null);

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

  useEffect(() => {
    const getOrganizationModel = async () => {
      // Only fetch if user is signed in
      if (!user?.id) {
        return;
      }

      try {
        const result = await getOrganizationSettings();
        if (result.success && result.settings) {
          setOrganizationDefaultModel(result.settings.model);
        } else {
          logger.error(
            { error: result.error },
            'Failed to fetch organization settings'
          );
        }
      } catch (error) {
        logger.error(
          { error: error },
          'Error fetching organization model settings'
        );
      }
    };
    getOrganizationModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  useEffect(() => {
    const fetchThreadModel = async () => {
      try {
        const result = await getThreadDetailsAction(threadId);
        if (result.success) {
          setCurrentThreadModel(result.preferredModel || null);
        } else {
          logger.error(
            { error: result.errorMessage },
            'Error fetching thread model'
          );
          setCurrentThreadModel(null);
        }
      } catch (error) {
        logger.error({ error }, 'Error fetching thread model');
        setCurrentThreadModel(null);
      }
    };

    fetchThreadModel();
  }, [threadId]);

  const handleModelChange = async (model: string) => {
    try {
      const result = await updateThreadModel(threadId, model);

      if (result.success) {
        setCurrentThreadModel(model);
        dispatch(updateThreadModelAction({ threadId, model }));
        dispatch(updateSidebarThreadModelAction({ threadId, model }));
      } else {
        throw new Error(result.error || 'Failed to update thread model');
      }
    } catch (error) {
      logger.error({ error }, 'Error updating thread model');
      throw error;
    }
  };

  return (
    <>
      {isSearchOpen && (
        <div onClick={closeSearch}>
          <SearchThreads visitorId={userVisitorId!} />
        </div>
      )}

      <div className="flex min-h-[calc(100vh-7rem)] lg:min-h-[calc(100vh-3rem)] flex-col font-sans -m-6 lg:-m-10">
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

        <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border/40 bg-background/80 backdrop-blur-md px-4 py-2.5">
          <BreadcrumbNavigation threadId={threadId} />
          <div className="flex items-center gap-2">
            <ProjectContextIndicator
              threadId={threadId}
              availableProjects={availableProjects}
            />
            {!isPublicAccess && (
              <ModelSelector
                currentModel={currentThreadModel || undefined}
                organizationDefaultModel={organizationDefaultModel}
                onChange={handleModelChange}
                disabled={isGlobalLoading}
              />
            )}
          </div>
        </div>

        <div className="flex-1">
          <ChatOutput
            responseType={responseType}
            messages={messages}
            isLoading={isGlobalLoading}
            loadingMessage={messageLoadingText}
            streamedMessage={streamedMessage}
            isPublicAccess={isPublicAccess}
            voiceId={voiceId}
          />
          <div ref={messagesEndDivRef} className="h-4" />
        </div>

        <div className="sticky bottom-0 border-t border-border/40 bg-background">
          {isLimitLock && !isSignedIn && <LimitReached />}
          {!isLocked() && threadId && organizationDefaultModel !== null && (
            <PromptForm
              handleResponseType={handleResponseType}
              ref={promptFormRef}
              isUserLogged={!!isSignedIn}
              isLoading={isGlobalLoading}
              onSubmit={onSubmit}
              isPublicAccess={isPublicAccess}
              responseType={responseType}
              currentThreadModel={currentThreadModel || undefined}
              organizationDefaultModel={organizationDefaultModel}
              onChange={handleModelChange}
              isGlobalLoading={isGlobalLoading}
            />
          )}
        </div>
      </div>
    </>
  );
};
