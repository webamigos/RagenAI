'use client';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { LimitReached } from './ChatOutput/LimitReached';
import { useAssistantLogic } from './useAssistantLogic';
import { VoiceMode } from './ChatOutput/VoiceMode/VoiceMode';
import { ProjectContextIndicator } from './ProjectContextIndicator';
import { BreadcrumbNavigation } from '../BreadcrumbNavigation';
import { ThreadModelLabel } from './ModelSelector/ThreadModelLabel';

import { useOrganization, useUser } from '@/app/hooks/use-auth';
import { useEffect, useMemo, useState } from 'react';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { ThreadContentPanel } from './ThreadContentPanel';
import { fetchVoiceId } from '@/app/components/MyProfile/ChatInstanceSettings/actions';
import { ChatResponseType } from '@/features/messages/contracts/message.types';
import { useDispatch, useSelector } from 'react-redux';
import { logger } from '@/app/lib/utils/logger';
import { setVoiceId, setRecording } from '@/store/voice/voiceSlice';
import { type RootState } from '@/store';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';
import { getOrganizationSettings } from '@/app/lib/actions/getOrganizationSettings';
import { getThreadDetailsAction } from '@/app/lib/actions/threads-actions';

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
    responseType,
    isLimitLock,
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
    (state: RootState) => state.assistant,
  );

  const messages = reduxMessages.length > 0 ? reduxMessages : localMessages;

  const { organization } = useOrganization();
  const { user } = useUser();
  const dispatch = useDispatch();
  const { voiceId, isRecording } = useSelector(
    (state: RootState) => state.assistant.voice,
  );
  const [availableProjects, setAvailableProjects] = useState<
    ProjectForContext[]
  >([]);
  const [currentThreadModel, setCurrentThreadModel] = useState<string | null>(
    null,
  );
  const [organizationDefaultModel, setOrganizationDefaultModel] = useState<
    string | null
  >(null);
  const [isContentPanelOpen, setIsContentPanelOpen] = useState(false);

  const allAttachments = useMemo(
    () => messages.flatMap((m) => m.attachments ?? []),
    [messages],
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
            }),
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
            'Failed to fetch organization settings',
          );
        }
      } catch (error) {
        logger.error(
          { error: error },
          'Error fetching organization model settings',
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
            'Error fetching thread model',
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

  return (
    <div className="flex min-h-[calc(100vh-7rem)] lg:min-h-[calc(100vh-3rem)] -m-6 lg:-m-10">
      <div className="flex flex-1 min-w-0 flex-col font-sans">
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
              <ThreadModelLabel
                model={currentThreadModel || organizationDefaultModel}
              />
            )}
            {allAttachments.length > 0 && (
              <button
                type="button"
                onClick={() => setIsContentPanelOpen(!isContentPanelOpen)}
                className={`p-1.5 rounded-md border transition-colors ${
                  isContentPanelOpen
                    ? 'border-border bg-muted text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                title="Content"
              >
                <DocumentTextIcon className="size-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1">
          <ChatOutput
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
            />
          )}
        </div>
      </div>

      {isContentPanelOpen && allAttachments.length > 0 && (
        <ThreadContentPanel
          attachments={allAttachments}
          onClose={() => setIsContentPanelOpen(false)}
        />
      )}
    </div>
  );
};
