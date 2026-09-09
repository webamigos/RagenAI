'use client';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { LimitReached } from './ChatOutput/LimitReached';
import { ReadOnlyBanner } from './ReadOnlyBanner';
import { useAssistantLogic } from './useAssistantLogic';
import type { PendingToolApproval } from '@/store/tool-approvals/toolApprovalsSlice';
import { ChatResponseType } from '@/features/messages/contracts/message.types';
import { ProjectContextIndicator } from './ProjectContextIndicator';
import { BreadcrumbNavigation } from '../BreadcrumbNavigation';
import { ThreadModelLabel } from './ModelSelector/ThreadModelLabel';
import { DeepThinkingToggle } from './ModelSelector/DeepThinkingToggle';
import {
  DEEP_THINKING_DEFAULT_MODEL,
  supportsReasoningEffort,
} from '../config';
import { updateThreadModel } from '@/features/threads/utils/update-thread-model';

import { useOrganization, useUser } from '@/app/hooks/use-auth';
import { useEffect, useMemo, useState } from 'react';
import {
  PageDropOverlay,
  usePageDrop,
  type DropZoneConfig,
} from '@/app/components/PageDropOverlay';
import { useTranslations } from 'next-intl';
import {
  DocumentTextIcon,
  ArrowUpTrayIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import { ThreadContentPanel } from './ThreadContentPanel';
import { ShareThreadDialog } from '@/app/components/ShareThreadDialog';
import { PublicShareDialog } from '@/app/components/PublicShareDialog';
import { useOrgFeature } from '@/app/hooks/useOrgFeatures';
import { fetchVoiceId } from '@/app/components/MyProfile/ChatInstanceSettings/actions';
import { useDispatch, useSelector } from 'react-redux';
import { logger } from '@/app/lib/utils/logger';
import { setVoiceId } from '@/store/voice/voiceSlice';
import { type RootState } from '@/store';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';
import { getOrganizationSettings } from '@/app/lib/actions/getOrganizationSettings';
import { getThreadDetailsAction } from '@/app/lib/actions/threads-actions';

type ProjectForContext = {
  id: string;
  title: string;
};

type Props = {
  threadId: string;
};

export const Assistant = ({ threadId }: Props) => {
  const {
    messageLoadingText,
    messagesEndDivRef,
    isGlobalLoading,
    streamedMessage,
    isPublicAccess,
    userVisitorId,
    responseType,
    isLimitLock,
    isReadOnly,
    isSignedIn,
    messages: localMessages,
    onSubmit,
    isLocked,
    promptFormRef,
    setVoiceMessageAsPlayed,
    onRegenerate,
  } = useAssistantLogic(threadId);

  const { messages: reduxMessages, error: assistantError } = useSelector(
    (state: RootState) => state.assistant,
  );

  const messages = reduxMessages.length > 0 ? reduxMessages : localMessages;

  const { organization } = useOrganization();
  const { user } = useUser();
  const dispatch = useDispatch();
  const { voiceId } = useSelector((state: RootState) => state.assistant.voice);
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
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isPublicShareOpen, setIsPublicShareOpen] = useState(false);
  const tDrop = useTranslations('page-drop');
  const publicThreadLinksEnabled = useOrgFeature('publicThreadLinks');
  const { isDragging } = usePageDrop();

  const dropZones: DropZoneConfig[] = useMemo(() => {
    if (isPublicAccess) {
      return [];
    }
    return [
      {
        label: tDrop('drop-to-chat'),
        onDrop: (files) => promptFormRef.current?.dropFiles(files),
      },
    ];
  }, [isPublicAccess, tDrop]);

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

  /**
   * "Deep thinking" is a derived UI state: it's on iff the thread's
   * preferred model supports `reasoning_effort` (currently GPT-OSS only).
   * Toggling on switches `Thread.preferredModel` to the deep-thinking
   * default; toggling off clears it so the thread falls back to org default.
   * No separate persistence layer is needed — the thread record is the
   * single source of truth, and the server auto-injects `reasoning_effort`
   * for any model that supports it.
   */
  const activeModel = currentThreadModel || organizationDefaultModel;
  const deepThinkingEnabled = activeModel
    ? supportsReasoningEffort(activeModel)
    : false;

  const handleDeepThinkingToggle = async (next: boolean) => {
    const targetModel = next ? DEEP_THINKING_DEFAULT_MODEL : null;
    try {
      await updateThreadModel(threadId, targetModel);
      setCurrentThreadModel(targetModel);
    } catch (error) {
      logger.error({ err: error }, 'Failed to switch model for deep thinking');
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-7rem)] lg:min-h-[calc(100vh-3rem)] -m-6 lg:-m-10">
      <PageDropOverlay visible={isDragging} zones={dropZones} />
      <div className="flex flex-1 min-w-0 flex-col font-sans">
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
            {!isPublicAccess && (
              <button
                type="button"
                onClick={() => setIsShareOpen(true)}
                className="p-1.5 rounded-md border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Share"
              >
                <ArrowUpTrayIcon className="size-4" />
              </button>
            )}
            {!isPublicAccess && publicThreadLinksEnabled && (
              <button
                type="button"
                data-testid="thread-public-share-btn"
                onClick={() => setIsPublicShareOpen(true)}
                className="p-1.5 rounded-md border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Share publicly"
              >
                <GlobeAltIcon className="size-4" />
              </button>
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

        <ShareThreadDialog
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          threadId={threadId}
        />

        {publicThreadLinksEnabled && (
          <PublicShareDialog
            isOpen={isPublicShareOpen}
            onClose={() => setIsPublicShareOpen(false)}
            threadId={threadId}
          />
        )}

        <div className="flex-1">
          <ChatOutput
            messages={messages}
            isLoading={isGlobalLoading}
            loadingMessage={messageLoadingText}
            streamedMessage={streamedMessage}
            isPublicAccess={isPublicAccess}
            voiceId={voiceId}
            threadId={threadId}
            onRegenerate={isReadOnly ? undefined : onRegenerate}
            onApproveToolCall={
              isReadOnly
                ? undefined
                : (approval: PendingToolApproval) => {
                    // Reuse the normal chat submission path with
                    // `approvedToolCalls` set. The server threads this into
                    // the chain's experimental_context so `needsApproval`
                    // lets the exact toolCallId through next turn.
                    const localName = approval.toolName.includes('__')
                      ? approval.toolName.slice(
                          approval.toolName.indexOf('__') + 2,
                        )
                      : approval.toolName;
                    onSubmit({
                      prompt: `Yes, please proceed with ${localName.replace(/_/g, ' ')}.`,
                      mode: 'rag',
                      messageType: ChatResponseType.TEXT,
                      approvedToolCalls: [approval.toolCallId],
                    });
                  }
            }
            onDenyToolCall={
              isReadOnly
                ? undefined
                : (approval: PendingToolApproval) => {
                    onSubmit({
                      prompt: 'No, cancel that tool call.',
                      mode: 'rag',
                      messageType: ChatResponseType.TEXT,
                      deniedToolCalls: [approval.toolCallId],
                    });
                  }
            }
          />
          <div ref={messagesEndDivRef} className="h-4" />
        </div>

        {/*
          `bg-card`, not `bg-background`. The composer is docked *inside* the
          panel, and the panel is a card — so painting it the page background
          put an off-white strip across the bottom of a white surface, with a
          border and a gradient drawing attention to the seam rather than
          hiding it. The dock is part of the panel and takes the panel's
          colour; the border alone is enough to separate it from the
          transcript.
        */}
        <div className="sticky bottom-0 border-t border-border/40 bg-card">
          {isLimitLock && !isSignedIn && <LimitReached />}
          {isReadOnly && <ReadOnlyBanner />}
          {!isLocked() && !isReadOnly && threadId && (
            <PromptForm
              ref={promptFormRef}
              isUserLogged={!!isSignedIn}
              isLoading={isGlobalLoading}
              onSubmit={onSubmit}
              isPublicAccess={isPublicAccess}
              responseType={responseType}
              modelSelector={
                !isPublicAccess && (
                  <DeepThinkingToggle
                    model={activeModel}
                    enabled={deepThinkingEnabled}
                    hasAttachments={false}
                    onToggle={handleDeepThinkingToggle}
                  />
                )
              }
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
