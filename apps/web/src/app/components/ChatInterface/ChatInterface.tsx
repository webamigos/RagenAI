'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOrganization, useUser, useAuth } from '@/app/hooks/use-auth';

import { classMerge } from '@ragenai/common-ui/index';
import { Link } from '@/i18n/routing';
import { getOrganizationSettings } from '@/app/lib/actions/getOrganizationSettings';
import { logger } from '@/app/lib/utils/logger';

import { useNewThreadInput } from './useNewThreadInput';
import {
  MentionTextarea,
  type MentionedProject,
  type MentionTextareaRef,
} from './MentionTextarea';
import { ModelSelectorInline } from './ModelSelectorInline';
import { StartFromSuggestions } from './StartFromSuggestions';
import { KnowledgeScopeSelector } from './KnowledgeScopeSelector';
import {
  DEEP_THINKING_DEFAULT_MODEL,
  supportsReasoningEffort,
} from '../config';
import {
  PageDropOverlay,
  usePageDrop,
  type DropZoneConfig,
} from '@/app/components/PageDropOverlay';

import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { MESSAGE_MAX_LENGTH } from '@/features/messages/contracts/message.types';
import { useOrgFeature } from '@/app/hooks/useOrgFeatures';
import { getUserProjectsQuery } from '@/features/projects/services/queries/get-user-projects-query';
import {
  DEFAULT_KNOWLEDGE_SCOPE,
  type KnowledgeScope,
} from '@ragenai/platform-contracts';

interface ChatInterfaceProps {
  className?: string;
  isEmbedded?: boolean;
  organizationId?: string;
  isPublicAccess?: boolean;
  widgetMode?: boolean;
  voiceId?: string;
  projectId?: string;
  projectTitle?: string;
  accessToken?: string;
  organizationDefaultModel?: string;
  /** If provided, a second drop zone for project knowledge is shown during drag */
  onProjectFilesDrop?: (files: File[]) => void;
  /** Hide the page-level drop overlay (e.g. when embedded) */
  hidePageDrop?: boolean;
  /** Prefills the composer — the command palette's "Ask about …" action. */
  initialPrompt?: string;
}

export const ChatInterface = ({
  className,
  accessToken,
  isEmbedded = false,
  organizationId,
  isPublicAccess = false,
  widgetMode = false,
  projectId,
  projectTitle,
  organizationDefaultModel,
  onProjectFilesDrop,
  hidePageDrop = false,
  initialPrompt,
}: ChatInterfaceProps) => {
  const voiceInputEnabled = useOrgFeature('voiceInput');
  const t = useTranslations('Index');
  const tDrop = useTranslations('page-drop');
  const tDeepThinking = useTranslations('assistant.deep-thinking');
  const { organization } = useOrganization();
  const { user } = useUser();
  const { orgId: sessionOrgId } = useAuth();
  const mentionTextareaRef = useRef<MentionTextareaRef>(null);
  const { isDragging } = usePageDrop();
  const [mentionedProject, setMentionedProject] =
    useState<MentionedProject | null>(null);
  const defaultModel = organizationDefaultModel || 'gemini-3-flash-preview';
  const [resolvedDefaultModel, setResolvedDefaultModel] = useState<
    string | null
  >(organizationDefaultModel || null);
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);
  const [threadDocuments, setThreadDocuments] = useState<ThreadDocumentUI[]>(
    [],
  );
  const [knowledgeScope, setKnowledgeScope] = useState<KnowledgeScope>(
    DEFAULT_KNOWLEDGE_SCOPE,
  );
  const [hasAssistants, setHasAssistants] = useState(false);

  const {
    prompt,
    isLoading,
    isPending,
    handleInputChange,
    handleKeyDown,
    handleSubmit,
    errors,
    setMentionedProjectInHook,
  } = useNewThreadInput({
    knowledgeScope,
    initialPrompt,
    organizationId,
    isPublicAccess,
    widgetMode,
    projectId,
    accessToken,
    preferredModel: selectedModel,
    threadDocuments,
    onThreadDocumentsChange: setThreadDocuments,
  });

  const dropZones = useMemo(() => {
    const zones: DropZoneConfig[] = [];
    if (!isPublicAccess && !hidePageDrop && !isEmbedded) {
      zones.push({
        label: tDrop('drop-to-chat'),
        onDrop: (files) => mentionTextareaRef.current?.dropFiles(files),
      });
      if (onProjectFilesDrop) {
        zones.push({
          label: tDrop('drop-to-project'),
          onDrop: onProjectFilesDrop,
        });
      }
    }
    return zones;
  }, [isPublicAccess, hidePageDrop, isEmbedded, onProjectFilesDrop, tDrop]);

  useEffect(() => {
    const getOrganizationModel = async () => {
      // Get orgId from organization hook or session.activeOrganizationId
      // (activeOrganizationId is set by finalizeUserOnboarding during login/registration)
      const orgId = organization?.id || sessionOrgId;

      if (!organizationDefaultModel && orgId && !isPublicAccess) {
        try {
          const result = await getOrganizationSettings();
          if (result.success && result.settings) {
            setResolvedDefaultModel(result.settings.model);
            // Only set selectedModel if it's still the default (hasn't been manually changed)
            setSelectedModel((prev) =>
              prev === (organizationDefaultModel || 'gemini-3-flash-preview')
                ? result.settings.model
                : prev,
            );
          }
        } catch (error) {
          logger.error('Error fetching organization model', error);
        }
      }
    };
    getOrganizationModel();
  }, [
    organizationDefaultModel,
    organization?.id,
    sessionOrgId,
    isPublicAccess,
  ]);

  // Whether the person has any assistants decides which of the two reasons the
  // Assistant level is unavailable for — "you have none" teaches something
  // different from "you have not named one". Failing quietly to `false` is the
  // safe direction: the level stays disabled rather than becoming selectable
  // and then rejected by the server.
  useEffect(() => {
    const orgId = organization?.id || sessionOrgId;
    if (!orgId || !user?.id || isPublicAccess) {
      return;
    }
    let cancelled = false;
    getUserProjectsQuery(orgId, user.id)
      .then((projects) => {
        if (!cancelled) {
          setHasAssistants(projects.length > 0);
        }
      })
      .catch((error) => {
        logger.error('Error loading assistants for the knowledge scope', error);
      });
    return () => {
      cancelled = true;
    };
  }, [organization?.id, sessionOrgId, user?.id, isPublicAccess]);

  // Removing the @mention after choosing Assistant would leave a scope the
  // server rejects — the one combination the spec promises the UI cannot
  // produce. Fall back rather than let the send fail; the picker greys the
  // level out at the same moment, so the change is visible and not silent.
  const assistantName = mentionedProject?.title ?? projectTitle;
  useEffect(() => {
    if (knowledgeScope === 'ASSISTANT' && !assistantName) {
      setKnowledgeScope(DEFAULT_KNOWLEDGE_SCOPE);
    }
  }, [knowledgeScope, assistantName]);

  // Only set the model once on mount, don't reset user's selection
  useEffect(() => {
    if (organizationDefaultModel) {
      setResolvedDefaultModel(organizationDefaultModel);
      // Don't reset selectedModel - user may have already chosen a different model
    }
  }, [organizationDefaultModel]);

  if (isEmbedded) {
    return null;
  }

  const handleProjectMention = (project: MentionedProject | null) => {
    setMentionedProject(project);
    setMentionedProjectInHook(project);
  };

  const userName = user?.name?.split(' ')[0];

  /**
   * "Deep thinking" is derived from the selected model — toggle just
   * switches between the deep-thinking default and the org default. The
   * server auto-injects `reasoning_effort` for any reasoning-capable model.
   */
  const deepThinkingEnabled = supportsReasoningEffort(selectedModel);
  const fallbackModel =
    resolvedDefaultModel || organizationDefaultModel || defaultModel;

  const handleDeepThinkingToggle = (next: boolean) => {
    setSelectedModel(next ? DEEP_THINKING_DEFAULT_MODEL : fallbackModel);
  };

  return (
    <div className={classMerge('w-full max-w-3xl mx-auto px-4', className)}>
      <PageDropOverlay visible={isDragging} zones={dropZones} />

      {!projectTitle && (
        <div className="flex flex-col items-center justify-center text-center mb-8 sm:mb-10">
          {/*
            The greeting is 12px, not 16px. It names you and then gets out of
            the way; at body size it competed with the question underneath it,
            which is the only thing on this screen anyone came to read.
          */}
          {userName && (
            <p className="mb-2 text-xs text-muted-foreground">
              {t('new-thread-greeting', { name: userName })}
            </p>
          )}
          {/*
            `--font-display` — Barlow Condensed — is the display face the token
            layer has carried since #992 with nothing using it. This is the one
            piece of type in the panel that is meant to be a voice rather than
            a label, which is what the token was added for.
          */}
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t('new-thread-header')}
          </h1>
          <p className="text-muted-foreground mt-3 text-base sm:text-lg">
            {isPublicAccess
              ? t('new-thread-description-public')
              : t('new-thread-description')}
          </p>
        </div>
      )}

      <div className="relative">
        <MentionTextarea
          ref={mentionTextareaRef}
          value={prompt}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          handleSubmit={handleSubmit}
          placeholder={t('new-thread-placeholder')}
          className="w-full min-h-[100px]"
          disabled={isLoading || isPending}
          showVoiceInput={!isPublicAccess && voiceInputEnabled}
          error={errors.prompt}
          onProjectMention={handleProjectMention}
          mentionedProject={mentionedProject}
          threadDocuments={threadDocuments}
          onThreadDocumentsChange={setThreadDocuments}
          hideAttachments={isPublicAccess}
          charLimit={MESSAGE_MAX_LENGTH}
          modelSelector={
            !isPublicAccess ? (
              <>
                {/*
                  Beside the model, not above the composer: both answer "how
                  will this be answered", and the scope is only editable until
                  the thread exists, so it belongs with the other pre-flight
                  choice rather than in the page's chrome.
                */}
                <KnowledgeScopeSelector
                  value={knowledgeScope}
                  onChange={setKnowledgeScope}
                  assistantName={assistantName}
                  hasAssistants={hasAssistants}
                  disabled={isLoading || isPending}
                />
                <ModelSelectorInline
                  selectedModel={selectedModel}
                  organizationDefaultModel={
                    resolvedDefaultModel || organizationDefaultModel
                  }
                  onChange={setSelectedModel}
                  disabled={isLoading || isPending}
                  deepThinkingEnabled={deepThinkingEnabled}
                  deepThinkingDisabled={threadDocuments.length > 0}
                  deepThinkingDisabledReason={
                    threadDocuments.length > 0
                      ? tDeepThinking('disabled-attachments')
                      : undefined
                  }
                  onDeepThinkingToggle={handleDeepThinkingToggle}
                />
              </>
            ) : undefined
          }
        />
      </div>

      {/*
        Only on a genuinely blank thread. Once there is a draft the cards would
        be offering to replace it, and inside a project or a public widget the
        thread already has a subject — a generic example is worse than nothing
        there.
      */}
      {!projectTitle && !isPublicAccess && prompt.trim().length === 0 && (
        <StartFromSuggestions
          onSelect={(suggestion) => {
            handleInputChange(suggestion);
            mentionTextareaRef.current?.focus();
          }}
        />
      )}

      {!projectTitle && !isPublicAccess && (
        <p className="text-center text-sm text-muted-foreground/60 mt-4">
          {t('new-thread-tip')}{' '}
          <Link
            href="/settings/connectors"
            className="text-muted-foreground/40 hover:text-muted-foreground/60"
            aria-label="Open connectors settings"
          >
            &rarr;
          </Link>
        </p>
      )}
    </div>
  );
};
