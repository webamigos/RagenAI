import { useTranslations } from 'next-intl';
import { memo } from 'react';
import { Text, Switch, Input } from '@ragenai/common-ui';
import { CopyButton } from '@ragenai/common-ui/CopyButton/CopyButton';
import { PublicProjectSection } from './PublicProjectSection';

type PublicLinkSectionProps = {
  isSharedLinkPublicly: boolean;
  shareUrl: string;
  isGeneratingKey: boolean;
  wasKeyGenerated: boolean;
  linkToPublicProject: string;
  publishedAt: string;
  onToggle: (checked: boolean) => void;
  projectId: number;
  onLinkRefreshed?: (newLink: string) => void;
};

export const PublicLinkSection = memo(
  ({
    isSharedLinkPublicly,
    shareUrl,
    isGeneratingKey,
    wasKeyGenerated,
    linkToPublicProject,
    publishedAt,
    onToggle,
    projectId,
    onLinkRefreshed,
  }: PublicLinkSectionProps) => {
    const t = useTranslations('projects');

    const renderContent = () => {
      if (isGeneratingKey) {
        return (
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            {t('share-knowledge.generating-link')}
          </Text>
        );
      }

      if (wasKeyGenerated) {
        return (
          <>
            <Text className="text-sm text-gray-600 dark:text-gray-400">
              {t('share-knowledge.link-to-knowledge')}
            </Text>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                readOnly
                value={shareUrl}
                className="p-2 text-sm"
                containerClassName="w-full"
                aria-label={t('share-knowledge.share-url')}
              />
              <CopyButton
                className="mt-4"
                textToCopy={shareUrl}
                showToast
                aria-label={t('share-knowledge.copy-link-aria-label')}
              />
            </div>
          </>
        );
      }

      return (
        <PublicProjectSection
          projectId={projectId}
          linkToPublicProject={linkToPublicProject}
          publishedAt={publishedAt}
          onLinkRefreshed={onLinkRefreshed}
        />
      );
    };

    return (
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('share-knowledge.share-publicly')}
          </Text>
          <Switch
            checked={isSharedLinkPublicly}
            onChange={onToggle}
            disabled={isGeneratingKey}
            aria-label={t('share-knowledge.toggle-sharing')}
          />
        </div>

        {isSharedLinkPublicly && <div className="mt-8">{renderContent()}</div>}
      </div>
    );
  }
);

PublicLinkSection.displayName = 'PublicLinkSection';
