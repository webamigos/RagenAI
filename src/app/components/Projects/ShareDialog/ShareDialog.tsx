'use client';

import { useState, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { statusToast } from '@/app/lib/utils/toast';
import { useProjectKeyGenerator } from '@/app/hooks/useProjectKeyGenerator';
import { useDisablePublicAccess } from '@/app/hooks/useDisablePublicAccess';
import { CopyButton } from '@ragenai/common-ui/CopyButton/CopyButton';
import { ArrowPath } from '@ragenai/common-ui/icons';

type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  projectPublicId: string;
  isPublicProject: boolean;
  linkToPublicProject: string;
  publishedAt: string;
};

function getOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export const ShareDialog = ({
  open,
  onClose,
  projectPublicId,
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
  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);

  const t = useTranslations('projects');
  const locale = useLocale();
  const getBaseUrl = () => `${getOrigin()}/${locale}/public/assistants`;
  const { generateKey, isGenerating: isGeneratingKey } =
    useProjectKeyGenerator(projectPublicId);
  const { disablePublicAccess, isDisabling } =
    useDisablePublicAccess(projectPublicId);
  const { errorToast, successToast } = statusToast();

  const generateTokenAndSetUrl = async () => {
    try {
      const accessToken = await generateKey();

      if (!accessToken) {
        errorToast({
          message: t('share-knowledge.refresh-error'),
        });
        return null;
      }

      wasPublicLinkKeyGenerated.current = true;
      return accessToken;
    } catch {
      errorToast({
        message: t('share-knowledge.refresh-error'),
      });
      return null;
    }
  };

  const handleShareToggle = (checked: boolean) => {
    if (checked && !shareUrl) {
      setIsSharedLinkPublicly(true);
      generateTokenAndSetUrl().then((accessToken) => {
        if (accessToken) {
          setShareUrl(`${getBaseUrl()}/${accessToken}`);
        } else {
          setIsSharedLinkPublicly(false);
        }
      });
    }
    if (!checked) {
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
    } catch {
      errorToast({
        message: t('share-knowledge.disable-error'),
      });
    } finally {
      setIsDisableModalOpen(false);
    }
  };

  const handleRefreshConfirm = async () => {
    try {
      const accessToken = await generateKey();
      if (accessToken) {
        const newFullLink = `${getBaseUrl()}/${accessToken}`;
        setShareUrl(newFullLink);
        setCurrentLinkToPublicProject(accessToken);
        setCurrentPublishedAt(new Date().toISOString());
        wasPublicLinkKeyGenerated.current = true;
        successToast({
          message: t('share-knowledge.refresh-success'),
        });
      } else {
        errorToast({
          message: t('share-knowledge.refresh-error'),
        });
      }
    } catch {
      errorToast({
        message: t('share-knowledge.refresh-error'),
      });
    } finally {
      setIsRefreshModalOpen(false);
    }
  };

  const displayLink = wasPublicLinkKeyGenerated.current
    ? shareUrl
    : currentLinkToPublicProject
      ? `${getBaseUrl()}/${currentLinkToPublicProject}`
      : '';

  const formattedDate = currentPublishedAt
    ? new Date(currentPublishedAt).toLocaleDateString(locale)
    : '';

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            onClose();
          }
        }}
      >
        <DialogContent
          className="max-w-lg"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('share-knowledge.title')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('share-knowledge.share-publicly')}
              </span>
              <Switch
                checked={isSharedLinkPublicly}
                onCheckedChange={handleShareToggle}
                disabled={isGeneratingKey}
                className="data-[state=checked]:bg-purple-600"
              />
            </div>

            {/* Content when shared */}
            {isSharedLinkPublicly && (
              <div className="space-y-3">
                {isGeneratingKey ? (
                  <p className="text-sm text-muted-foreground">
                    {t('share-knowledge.generating-link')}
                  </p>
                ) : displayLink ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {t('share-knowledge.link-to-knowledge')}
                    </p>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={displayLink} className="text-sm" />
                      <CopyButton
                        textToCopy={displayLink}
                        showToast
                        aria-label={t('share-knowledge.copy-link-aria-label')}
                      />
                      <button
                        type="button"
                        onClick={() => setIsRefreshModalOpen(true)}
                        className="shrink-0 p-2 rounded-md hover:bg-muted transition-colors"
                        aria-label={t(
                          'share-knowledge.refresh-link-aria-label',
                        )}
                      >
                        <ArrowPath className="size-4" />
                      </button>
                    </div>
                    {formattedDate && (
                      <p className="text-xs text-muted-foreground">
                        {t('share-knowledge.project-table.publishedAt')}:{' '}
                        {formattedDate}
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Disable confirmation */}
      <AlertDialog
        open={isDisableModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsDisableModalOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('share-knowledge.disable-title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('share-knowledge.disable-confirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableConfirm}
              disabled={isDisabling}
              className="border border-red-300 bg-transparent text-red-600 hover:bg-red-600 hover:text-white dark:border-red-700 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white"
            >
              {isDisabling
                ? t('share-knowledge.disabling')
                : t('share-knowledge.disable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refresh confirmation */}
      <AlertDialog
        open={isRefreshModalOpen}
        onOpenChange={setIsRefreshModalOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('share-knowledge.refresh-link-title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('share-knowledge.refresh-link-confirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRefreshConfirm}
              disabled={isGeneratingKey}
            >
              {isGeneratingKey
                ? t('share-knowledge.refreshing')
                : t('share-knowledge.refresh')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
