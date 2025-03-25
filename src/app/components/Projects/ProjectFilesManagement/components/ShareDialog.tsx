import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';
import { Dialog, Text, Switch, Input } from '@ragenai/common-ui';
import { generateKey } from '@/app/[locale]/(marketing)/generate-access-key/actions/generate-key';
import { useState } from 'react';

type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: number;
};

export const ShareDialog = ({ open, onClose, projectId }: ShareDialogProps) => {
  const [isSharedPublicly, setIsSharedPublicly] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const t = useTranslations('projects');
  const { organization } = useOrganization();

  const handleShareToggle = async (checked: boolean) => {
    setIsSharedPublicly(checked);
    if (checked && !shareUrl) {
      if (!organization) {
        return;
      }

      try {
        setIsGeneratingKey(true);
        const key = await generateKey(organization.id, projectId);
        const url = `${window.location.origin}/pl/public/${key}`;
        setShareUrl(url);
      } catch (error) {
        setIsSharedPublicly(false);
      } finally {
        setIsGeneratingKey(false);
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md">
      <div className="p-6 space-y-4">
        <Text className="text-lg font-semibold">
          {t('share-knowledge.title')}
        </Text>

        <div className="flex items-center justify-between">
          <Text className="text-sm text-gray-700 dark:text-gray-300">
            {t('share-knowledge.share-publicly')}
          </Text>
          <Switch
            checked={isSharedPublicly}
            onChange={handleShareToggle}
            disabled={isGeneratingKey}
          />
        </div>

        {isSharedPublicly && (
          <div className="mt-2 space-y-2">
            {isGeneratingKey ? (
              <Text className="text-sm text-gray-600 dark:text-gray-400">
                {t('share-knowledge.generating-link')}
              </Text>
            ) : (
              <>
                <Text className="text-sm text-gray-600 dark:text-gray-400">
                  {t('share-knowledge.link-to-knowledge')}
                </Text>
                <Input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="w-full p-2"
                />
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};
