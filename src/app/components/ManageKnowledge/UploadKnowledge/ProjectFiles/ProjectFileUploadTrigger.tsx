'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';

import { Card, Dialog, ClourArrowIcon, Text } from '@ragenai/common-ui';

import { useClientOnly } from '@/app/hooks/useClientOnly';
import { getProjectFiles } from '@/app/actions';

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

// Component that shows the actual content once loaded
const ProjectFileUploadContent = ({
  status,
  t,
}: {
  status: FileStatus;
  t: any;
}) => {
  const { hasFiles, fileCount } = status;

  if (hasFiles) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-8 w-8 bg-primary-blue-400/20 dark:bg-accent-dark-300 rounded-full">
          <span className="text-primary-blue-500 dark:text-gray-200 text-sm font-medium">
            {fileCount}
          </span>
        </div>
        <div className="flex flex-col items-start">
          <Text className="font-medium text-primary-blue-500 dark:text-gray-200">
            {fileCount}{' '}
            {fileCount === 1 ? t('file-singular') : t('file-plural')}
          </Text>
          <Text className="text-sm text-gray-600 dark:text-gray-400">
            {t('manage-files')}
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 dark:text-gray-200">
      <Text>{t('upload-file')}</Text>
      <ClourArrowIcon className="h-5 w-5" />
    </div>
  );
};

export const ProjectFileUploadTrigger = ({
  projectId,
  projectPublicId,
}: Props) => {
  const [fileStatus, setFileStatus] = useState<FileStatus>({
    hasFiles: false,
    fileCount: 0,
    loading: true,
  });

  const isReady = useClientOnly();
  const [showUploader, setShowUploader] = useState(false);
  const t = useTranslations('projects');
  const { organization } = useOrganization();

  useEffect(() => {
    const checkProjectFiles = async () => {
      if (!organization) return;

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

  // Memoized card class to prevent recalculations
  const cardClass = useMemo(() => {
    const baseClass =
      'w-full py-6 flex items-center justify-center gap-2 cursor-pointer transition-all duration-300';

    const opacityClass =
      isReady && !fileStatus.loading ? 'opacity-100' : 'opacity-0';

    const styleClass = fileStatus.hasFiles
      ? 'bg-gray-50 hover:bg-gray-100 dark:bg-accent-dark-500 dark:hover:bg-accent-dark-700 border-gray-200 dark:border-gray-700'
      : 'bg-gray-100 hover:bg-gray-50 dark:bg-accent-dark-500 dark:hover:bg-accent-dark-700 text-gray-800';

    return `${baseClass} ${opacityClass} ${styleClass}`;
  }, [isReady, fileStatus.hasFiles, fileStatus.loading]);

  return (
    <>
      <Card onClick={() => setShowUploader(true)} className={cardClass}>
        <ProjectFileUploadContent status={fileStatus} t={t} />
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
    </>
  );
};
