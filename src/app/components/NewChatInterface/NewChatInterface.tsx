'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useOrganization, useUser, useAuth } from '@/app/hooks/use-auth';

import { classMerge } from '@ragenai/common-ui/index';
import { Link } from '@/i18n/routing';
import { getOrganizationSettings } from '@/app/lib/actions/getOrganizationSettings';
import { logger } from '@/app/lib/utils/logger';

import { useNewThreadInput } from './useNewThreadInput';
import { MentionTextarea, type MentionedProject } from './MentionTextarea';
import { ModelSelectorInline } from './ModelSelectorInline';

import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';

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
  const defaultModel =
    organizationDefaultModel || 'google/gemini-3-flash-preview';
  const [resolvedDefaultModel, setResolvedDefaultModel] = useState<
    string | null
  >(organizationDefaultModel || null);
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);
  const [threadDocuments, setThreadDocuments] = useState<ThreadDocumentUI[]>(
    [],
  );

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
            setResolvedDefaultModel(result.settings.model);
            // Only set selectedModel if it's still the default (hasn't been manually changed)
            setSelectedModel((prev) =>
              prev ===
              (organizationDefaultModel || 'google/gemini-3-flash-preview')
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

  return (
    <div className={classMerge('w-full max-w-3xl mx-auto px-4', className)}>
      {!projectTitle && (
        <div className="flex flex-col items-center justify-center text-center mb-8 sm:mb-10">
          {userName && (
            <p className="text-muted-foreground text-base mb-2">
              {t('new-thread-greeting', { name: userName })}
            </p>
          )}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('new-thread-header')}
          </h1>
          <p className="text-muted-foreground mt-3 text-base sm:text-lg">
            {t('new-thread-description')}
          </p>
        </div>
      )}

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
          onProjectMention={handleProjectMention}
          mentionedProject={mentionedProject}
          threadDocuments={threadDocuments}
          onThreadDocumentsChange={setThreadDocuments}
          hideAttachments={isPublicAccess}
          modelSelector={
            !isPublicAccess ? (
              <ModelSelectorInline
                selectedModel={selectedModel}
                organizationDefaultModel={
                  resolvedDefaultModel || organizationDefaultModel
                }
                onChange={setSelectedModel}
                disabled={isLoading || isPending}
              />
            ) : undefined
          }
        />
      </div>

      {!projectTitle && !isPublicAccess && (
        <p className="text-center text-sm text-muted-foreground/60 mt-4">
          {t('new-thread-tip')}{' '}
          <Link
            href="/settings/connectors"
            className="text-muted-foreground/40 hover:text-muted-foreground/60"
          >
            &rarr;
          </Link>
        </p>
      )}
    </div>
  );
};
