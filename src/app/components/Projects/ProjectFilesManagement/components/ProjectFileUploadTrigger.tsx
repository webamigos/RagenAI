'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';

import {
  Card,
  Dialog,
  ClourArrowIcon,
  Text,
  DocumentIcon,
  Skeleton,
  RSSIcon,
  Switch,
  Button,
} from '@ragenai/common-ui';

import { getProjectFiles } from '@/app/actions';
import { generateKey } from '@/app/[locale]/(marketing)/generate-access-key/actions/generate-key';
import { ProjectFileUpload } from './ProjectFileUpload';

type Props = {
  projectId: number;
  projectPublicId: string;
};

type FileStatus = {
  hasFiles: boolean;
  fileCount: number;
  loading: boolean;
};

type ProjectFileUploadContentProps = {
  status: FileStatus;
  t: (value: string) => string;
  onRssClick?: () => void;
};

const ProjectFileUploadContent = ({
  status,
  t,
  onRssClick,
}: ProjectFileUploadContentProps) => {
  const { hasFiles, fileCount, loading } = status;

  if (loading) {
    return <Skeleton className="-mt-4" height="h-20" />;
  }

  if (hasFiles) {
    return (
      <div className="flex items-center justify-between w-full">
        <div
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 duration-200 p-1 hover:bg-gray-200 dark:hover:bg-accent-dark-500 rounded-lg transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onRssClick?.();
          }}
        >
          <RSSIcon className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <Text className="font-medium text-gray-900 dark:text-gray-200">
            {t('project-files')}
          </Text>
          <Text className="text-sm text-gray-600 dark:text-gray-400">
            {fileCount}{' '}
            {fileCount === 1 ? t('file-singular') : t('file-plural')}
          </Text>
        </div>
        <div className="flex items-center">
          <div className="flex items-center">
            {Array.from({ length: Math.min(fileCount, 5) }).map((_, index) => (
              <div
                key={index}
                className="h-8 w-8 bg-primary-blue-500 rounded-full flex items-center justify-center text-white shadow-md -ml-2 first:ml-0"
                style={{ zIndex: 5 - index }}
              >
                <DocumentIcon />
              </div>
            ))}
          </div>
          {fileCount > 5 && (
            <Text className="ml-1 text-sm font-medium text-gray-600 dark:text-gray-400">
              +{fileCount - 5}
            </Text>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-12 justify-center">
      <div className="flex items-center gap-2 dark:text-gray-200">
        <Text className="font-medium text-gray-900 dark:text-gray-200">
          {t('upload-file')}
        </Text>
        <ClourArrowIcon className="h-6 w-6 text-primary-blue-500" />
      </div>
    </div>
  );
};
export const ProjectFileUploadTrigger = ({
  projectId,
  projectPublicId,
}: Props) => {
  const [showUploader, setShowUploader] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isSharedPublicly, setIsSharedPublicly] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [fileStatus, setFileStatus] = useState<FileStatus>({
    hasFiles: false,
    fileCount: 0,
    loading: true,
  });

  const t = useTranslations('projects');
  const { organization } = useOrganization();

  useEffect(() => {
    const checkProjectFiles = async () => {
      if (!organization) {
        return;
      }

      try {
        const result = await getProjectFiles(projectId);

        if (!result.error && result.files) {
          setFileStatus({
            hasFiles: result.files.length > 0,
            fileCount: result.files.length,
            loading: false,
          });
        } else {
          setFileStatus({
            hasFiles: false,
            fileCount: 0,
            loading: false,
          });
        }
      } catch (error) {
        setFileStatus({
          hasFiles: false,
          fileCount: 0,
          loading: false,
        });
      }
    };

    checkProjectFiles();
  }, [projectId, organization, showUploader]);

  const handleDialogClose = () => {
    setShowUploader(false);
  };
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
    <>
      <Card
        size="full"
        onClick={() => setShowUploader(true)}
        className="group relative h-28 cursor-pointer"
      >
        <ProjectFileUploadContent
          status={fileStatus}
          t={t}
          onRssClick={() => setShowShareDialog(true)}
        />
      </Card>

      <Dialog
        className="max-h-[400px] overflow-y-auto"
        open={showUploader}
        onClose={handleDialogClose}
      >
        <ProjectFileUpload
          projectId={projectId}
          projectPublicId={projectPublicId}
          initialFileCount={fileStatus.fileCount}
        />
      </Dialog>

      <Dialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        className="max-w-md"
      >
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
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="w-full p-2 text-sm bg-gray-50 dark:bg-accent-dark-500 rounded-md"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
};
