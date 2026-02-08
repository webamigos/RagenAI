'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useOrganization, useUser, useAuth } from '@/app/hooks/use-auth';

import { classMerge } from '@ragenai/common-ui/index';
import { getOrganizationSettings } from '@/app/lib/actions/getOrganizationSettings';
import { logger } from '@/app/lib/utils/logger';

import { useNewThreadInput } from './useNewThreadInput';
import { MentionTextarea, type MentionedProject } from './MentionTextarea';
import { ModelSelectorInline } from './ModelSelectorInline';

import { ChatResponseType } from '@/app/contracts/Message';
import { ThreadDocumentUI } from '@/app/contracts/ThreadDocument';

interface NewChatInterfaceProps {
  className?: string;
  isEmbedded?: boolean;
  organizationId?: string;
  isPublicAccess?: boolean;
  widgetMode?: boolean;
  voiceId?: string;
  projectId?: number;
  projectPublicId?: string;
  projectTitle?: string;
  accessToken?: string;
  organizationDefaultModel?: string;
}

export const NewChatInterface = ({
  className,
  accessToken,
  isEmbedded = false,
  organizationId,
  isPublicAccess = false,
  widgetMode = false,
  projectId,
  projectPublicId,
  projectTitle,
  organizationDefaultModel,
}: NewChatInterfaceProps) => {
  const t = useTranslations('Index');
  const { organization } = useOrganization();
  const { user } = useUser();
  const { orgId: sessionOrgId } = useAuth(); // Get orgId from session.activeOrganizationId
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [mentionedProject, setMentionedProject] =
    useState<MentionedProject | null>(null);
  const [
    internalOrganizationDefaultModel,
    setInternalOrganizationDefaultModel,
  ] = useState<string | null>(organizationDefaultModel || null);
  const [selectedModel, setSelectedModel] = useState<string>(
    organizationDefaultModel || 'gemini-2.0-flash'
  );
  const [threadDocuments, setThreadDocuments] = useState<ThreadDocumentUI[]>(
    []
  );

  const {
    prompt,
    isLoading,
    isPending,
    handleInputChange,
    handleKeyDown,
    createVoiceThread,
    handleSubmit,
    errors,
    setMentionedProjectInHook,
  } = useNewThreadInput({
    organizationId,
    isPublicAccess,
    widgetMode,
    projectId,
    projectPublicId,
    accessToken,
    preferredModel: selectedModel,
    threadDocuments,
    onThreadDocumentsChange: setThreadDocuments,
  });

  useEffect(() => {
    if (!isEmbedded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEmbedded]);

  useEffect(() => {
    const getOrganizationModel = async () => {
      // Get orgId from organization hook or session.activeOrganizationId
      // (activeOrganizationId is set by finalizeUserOnboarding during login/registration)
      const orgId = organization?.id || sessionOrgId;

      if (!organizationDefaultModel && orgId && !isPublicAccess) {
        try {
          const result = await getOrganizationSettings();
          if (result.success && result.settings) {
            setInternalOrganizationDefaultModel(result.settings.model);
            // Only set selectedModel if it's still the default (hasn't been manually changed)
            setSelectedModel((prev) =>
              prev === (organizationDefaultModel || 'gemini-2.0-flash')
                ? result.settings.model
                : prev
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

  // Only set the model once on mount, don't reset user's selection
  useEffect(() => {
    if (organizationDefaultModel) {
      setInternalOrganizationDefaultModel(organizationDefaultModel);
      // Don't reset selectedModel - user may have already chosen a different model
    }
  }, [organizationDefaultModel]);

  if (isEmbedded) {
    return null;
  }

  // Show loading state while fetching organization settings
  if (
    !isPublicAccess &&
    !organizationDefaultModel &&
    internalOrganizationDefaultModel === null
  ) {
    return (
      <div className={classMerge('w-full max-w-3xl mx-auto px-4', className)}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const handleVoiceModeActivation = async () => {
    sessionStorage.setItem('voice_mode_active', 'true');
    sessionStorage.setItem('response_type', ChatResponseType.VOICE);
    await createVoiceThread();
  };

  const handleProjectMention = (project: MentionedProject | null) => {
    setMentionedProject(project);
    setMentionedProjectInHook(project);
  };

  return (
    <div className={classMerge('w-full max-w-3xl mx-auto px-4', className)}>
      <div className="flex flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-semibold mb-4 sm:text-3xl">
          {t('new-thread-header')}
        </h1>
        <p className="text-muted-foreground mb-8 text-lg sm:mb-10">
          {projectTitle
            ? t('project-context', { projectTitle })
            : t('new-thread-description')}
        </p>
      </div>

      <div className="relative">
        <MentionTextarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          handleSubmit={handleSubmit}
          placeholder={t('new-thread-placeholder')}
          className="w-full min-h-[100px]"
          disabled={isLoading || isPending}
          showVoiceInput={!isPublicAccess}
          error={errors.prompt}
          handleResponseType={handleVoiceModeActivation}
          onProjectMention={handleProjectMention}
          mentionedProject={mentionedProject}
          threadDocuments={threadDocuments}
          onThreadDocumentsChange={setThreadDocuments}
          modelSelector={
            !isPublicAccess ? (
              <ModelSelectorInline
                selectedModel={selectedModel}
                organizationDefaultModel={
                  internalOrganizationDefaultModel || organizationDefaultModel
                }
                onChange={setSelectedModel}
                disabled={isLoading || isPending}
              />
            ) : undefined
          }
        />
      </div>
    </div>
  );
};
