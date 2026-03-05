'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/app/hooks/use-auth';

import { Dialog } from '@ragenai/common-ui/Dialog';
import { Text } from '@ragenai/common-ui/Text';
import { statusToast } from '@/app/lib/utils/toast';
import { useProjectKeyGenerator } from '@/app/hooks/useProjectKeyGenerator';
import { useDisablePublicAccess } from '@/app/hooks/useDisablePublicAccess';

import { PublicLinkSection } from './components/PublicLinkSection';

type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: number;
  isPublicProject: boolean;
  linkToPublicProject: string;
  publishedAt: string;
};

function getOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function getBaseUrl() {
  return `${getOrigin()}/pl/public/assistants`;
}

export const ShareDialog = ({
  open,
  onClose,
  projectId,
  isPublicProject,
  linkToPublicProject,
  publishedAt,
}: ShareDialogProps) => {
  const [isSharedLinkPublicly, setIsSharedLinkPublicly] = useState(
    isPublicProject || false,
  );
  const [shareUrl, setShareUrl] = useState('');
  const wasPublicLinkKeyGenerated = useRef<boolean>(false);
  const [currentLinkToPublicProject, setCurrentLinkToPublicProject] =
    useState(linkToPublicProject);
  const [currentPublishedAt, setCurrentPublishedAt] = useState(publishedAt);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);

  const t = useTranslations('projects');
  const { organization } = useOrganization();
  const { generateKey, isGenerating: isGeneratingKey } =
    useProjectKeyGenerator(projectId);
  const { disablePublicAccess, isDisabling } =
    useDisablePublicAccess(projectId);
  const { errorToast, successToast } = statusToast();

  const generateTokenAndSetUrl = async () => {
    if (!organization) {
      return null;
    }

    try {
      const accessToken = await generateKey();

      if (!accessToken) {
        return null;
      }

      wasPublicLinkKeyGenerated.current = true;
      return accessToken;
    } catch (error) {
      errorToast({
        message: t('share-knowledge.refresh-error'),
      });
      return null;
    }
  };

  const handleShareToggle = async (checked: boolean) => {
    if (checked) {
      setIsSharedLinkPublicly(true);
      if (!shareUrl) {
        const accessToken = await generateTokenAndSetUrl();
        if (accessToken) {
          setShareUrl(`${getBaseUrl()}/${accessToken}`);
        } else {
          setIsSharedLinkPublicly(false);
        }
      }
    } else {
      // When toggling off, show confirmation modal
      setIsDisableModalOpen(true);
    }
  };

  const handleDisableConfirm = async () => {
    try {
      const success = await disablePublicAccess();

      if (success) {
        setIsSharedLinkPublicly(false);
        setShareUrl('');
        wasPublicLinkKeyGenerated.current = false;
        setCurrentLinkToPublicProject('');
        setCurrentPublishedAt('');
        successToast({
          message: t('share-knowledge.disable-success'),
        });
      } else {
        errorToast({
          message: t('share-knowledge.disable-error'),
        });
      }
    } catch (error) {
      errorToast({
        message: t('share-knowledge.disable-error'),
      });
    } finally {
      setIsDisableModalOpen(false);
    }
  };

  const handleDisableCancel = () => {
    setIsDisableModalOpen(false);
  };

  const handleLinkRefreshed = (newLink: string) => {
    setCurrentLinkToPublicProject(newLink);
    setCurrentPublishedAt(new Date().toISOString());
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-xl">
      <div className="w-full p-6 space-y-6">
        <Text className="text-xl font-semibold">
          {t('share-knowledge.title')}
        </Text>

        <div>
          {/* PUBLIC LINK */}
          <PublicLinkSection
            isSharedLinkPublicly={isSharedLinkPublicly}
            shareUrl={shareUrl}
            isGeneratingKey={isGeneratingKey}
            wasKeyGenerated={wasPublicLinkKeyGenerated.current}
            linkToPublicProject={`${getBaseUrl()}/${currentLinkToPublicProject}`}
            publishedAt={currentPublishedAt}
            projectId={projectId}
            onToggle={handleShareToggle}
            onLinkRefreshed={handleLinkRefreshed}
          />
        </div>
      </div>

      {/* Confirmation Modal for Disabling Public Access */}
      <Dialog
        open={isDisableModalOpen}
        onClose={handleDisableCancel}
        className="max-w-md"
      >
        <div className="p-6 space-y-4">
          <Text className="text-lg font-semibold">
            {t('share-knowledge.disable-title')}
          </Text>
          <Text className="text-sm text-gray-600 dark:text-gray-400">
            {t('share-knowledge.disable-confirmation')}
          </Text>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleDisableCancel}
              className="px-4 py-2 rounded text-sm text-gray-700 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleDisableConfirm}
              disabled={isDisabling}
              className="px-4 py-2 rounded text-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDisabling
                ? t('share-knowledge.disabling')
                : t('share-knowledge.disable')}
            </button>
          </div>
        </div>
      </Dialog>
    </Dialog>
  );
};
