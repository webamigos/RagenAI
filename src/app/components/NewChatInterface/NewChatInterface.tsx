import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { classMerge, Textarea } from '@ragenai/common-ui/index';

import { useNewThreadInput } from './useNewThreadInput';

interface NewChatInterfaceProps {
  className?: string;
  isEmbedded?: boolean;
  organizationId?: string;
  isPublicAccess?: boolean;
  widgetMode?: boolean;
}

export const NewChatInterface = ({
  className,
  isEmbedded = false,
  organizationId,
  isPublicAccess = false,
  widgetMode = false,
}: NewChatInterfaceProps) => {
  const t = useTranslations('Index');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { prompt, isLoading, isPending, handleInputChange, handleKeyDown } =
    useNewThreadInput({
      organizationId,
      isPublicAccess,
      widgetMode,
    });

  useEffect(() => {
    if (!isEmbedded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEmbedded]);

  if (isEmbedded) {
    return null;
  }

  return (
    <div className={classMerge('w-full max-w-3xl mx-auto px-4', className)}>
      <div className="flex flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-semibold mb-4">
          {t('new-thread-header')}
        </h1>
        <p className="text-muted-foreground mb-6">
          {t('new-thread-description')}
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
        />
      </div>
    </div>
  );
};
