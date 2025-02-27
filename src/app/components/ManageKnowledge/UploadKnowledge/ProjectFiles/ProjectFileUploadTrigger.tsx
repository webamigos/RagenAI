'use client';

import { useState, useEffect } from 'react';
import { Card, Dialog, ClourArrowIcon, Text } from '@ragenai/common-ui';
import { ProjectFileUpload } from './ProjectFileUpload';
import { useTranslations } from 'next-intl';
import { getProjectFiles } from '@/app/actions';
import { useOrganization } from '@clerk/nextjs';

type Props = {
  projectId: number;
  projectPublicId: string;
};

// Component that shows the actual content once loaded
const ProjectFileUploadContent = ({
  hasFiles,
  fileCount,
  loading,
  t,
}: {
  hasFiles: boolean;
  fileCount: number;
  loading: boolean;
  t: any;
}) => {
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 border-2 border-t-blue-500 rounded-full animate-spin"></div>
        <Text>{t('loading')}</Text>
      </div>
    );
  }

  if (hasFiles) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-8 w-8 bg-blue-100 dark:bg-blue-800/30 rounded-full">
          <span className="text-blue-600 dark:text-blue-300 text-sm font-medium">
            {fileCount}
          </span>
        </div>
        <div className="flex flex-col items-start">
          <Text className="font-medium text-blue-600 dark:text-blue-300">
            {fileCount}{' '}
            {fileCount === 1
              ? t('file-singular') || 'file'
              : t('file-plural') || 'files'}
          </Text>
          <Text className="text-sm text-blue-500 dark:text-blue-400">
            {t('manage-files') || 'Manage project files'}
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
  const [showUploader, setShowUploader] = useState(false);
  const [hasFiles, setHasFiles] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [contentReady, setContentReady] = useState(false);
  const t = useTranslations('projects');
  const { organization } = useOrganization();

  // Reserve space with a stable height before content loads
  useEffect(() => {
    // Wait for next tick to ensure everything is mounted
    const timer = setTimeout(() => {
      setContentReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Check if project has files
  useEffect(() => {
    const checkProjectFiles = async () => {
      if (!organization) return;

      try {
        const result = await getProjectFiles(projectId);

        if (!result.error && result.files) {
          setHasFiles(result.files.length > 0);
          setFileCount(result.files.length);
        } else {
          setHasFiles(false);
          setFileCount(0);
        }
      } catch (error) {
        // Silent failure, just set hasFiles to false
        setHasFiles(false);
      } finally {
        setLoading(false);
      }
    };

    checkProjectFiles();
  }, [projectId, organization, showUploader]);

  // Handle dialog close and refresh file status
  const handleDialogClose = () => {
    setShowUploader(false);
  };

  // Generate consistent class to prevent flickering
  const getCardClass = () => {
    const baseClass =
      'w-full py-6 flex items-center justify-center gap-2 cursor-pointer transition-all duration-300';

    return `${baseClass} ${contentReady ? 'opacity-100' : 'opacity-0'} ${
      hasFiles
        ? 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 border-blue-200 dark:border-blue-800'
        : 'bg-gray-100 hover:bg-gray-50 dark:hover:bg-accent-dark-700 text-gray-800'
    }`;
  };

  return (
    <>
      {/* Stable height placeholder to prevent layout shifts */}
      <Card
        onClick={() => contentReady && setShowUploader(true)}
        className={getCardClass()}
      >
        {contentReady && (
          <ProjectFileUploadContent
            hasFiles={hasFiles}
            fileCount={fileCount}
            loading={loading}
            t={t}
          />
        )}
      </Card>

      <Dialog open={showUploader} onClose={handleDialogClose} size="lg">
        <ProjectFileUpload
          projectId={projectId}
          projectPublicId={projectPublicId}
        />
      </Dialog>
    </>
  );
};
