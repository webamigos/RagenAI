import { useTranslations } from 'next-intl';
import { memo } from 'react';
import { Text, Input } from '@ragenai/common-ui';
import { CopyButton } from '@ragenai/common-ui/CopyButton/CopyButton';

type EmbedScriptSectionProps = {
  embedScript: string;
};

export const EmbedScriptSection = memo(
  ({ embedScript }: EmbedScriptSectionProps) => {
    const t = useTranslations('projects');

    return (
      <div className="mt-4">
        <Text className="text-sm text-gray-600 dark:text-gray-400">
          {t('share-knowledge.embed-code')}:
        </Text>
        <div className="w-full flex gap-1 items-center">
          <Input
            type="text"
            readOnly
            value={embedScript}
            className="p-2"
            containerClassName="w-full"
            aria-label={t('share-knowledge.embed-script-aria-label')}
          />
          <CopyButton
            showToast
            className="mt-4"
            textToCopy={embedScript}
            aria-label={t('share-knowledge.copy-embed-script-aria-label')}
          />
        </div>
      </div>
    );
  }
);

EmbedScriptSection.displayName = 'EmbedScriptSection';
