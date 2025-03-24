'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { classMerge, Textarea } from '@ragenai/common-ui/index';

import { useNewThreadInput } from './useNewThreadInput';

import { ChatResponseType } from '@/app/contracts/Message';

interface NewChatInterfaceProps {
  className?: string;
  isEmbedded?: boolean;
  organizationId?: string;
  isPublicAccess?: boolean;
  widgetMode?: boolean;
  voiceId?: string;
  projectId: number;
  projectPublicId?: string;
  projectTitle?: string;
}

export const NewChatInterface = ({
  className,
  isEmbedded = false,
  organizationId,
  isPublicAccess = false,
  widgetMode = false,
  projectId,
  projectPublicId,
  projectTitle,
}: NewChatInterfaceProps) => {
  const t = useTranslations('Index');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const {
    prompt,
    isLoading,
    isPending,
    handleInputChange,
    handleKeyDown,
    createVoiceThread,
    errors,
  } = useNewThreadInput({
    organizationId,
    isPublicAccess,
    widgetMode,
    projectId,
    projectPublicId,
  });

  useEffect(() => {
    if (!isEmbedded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEmbedded]);

  if (isEmbedded) {
    return null;
  }

  const handleVoiceModeActivation = async () => {
    sessionStorage.setItem('voice_mode_active', 'true');
    sessionStorage.setItem('response_type', ChatResponseType.VOICE);
    await createVoiceThread();
  };

  return (
    <div className={classMerge('w-full max-w-3xl mx-auto px-4', className)}>
      <div className="flex flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-semibold mb-4">
          {t('new-thread-header')}
        </h1>
        <p className="text-muted-foreground mb-6">
          {projectTitle
            ? t('project-context', { projectTitle })
            : t('new-thread-description')}
        </p>
      </div>

      <div className="relative">
        <Textarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('new-thread-placeholder')}
          className="w-full min-h-[100px]"
          disabled={isLoading || isPending}
          showVoiceInput={!isPublicAccess}
          error={errors.prompt}
          handleResponseType={handleVoiceModeActivation}
        />
      </div>
    </div>
  );
};
