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
} from '@ragenai/common-ui';

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
      <div className="flex items-center justify-between w-full">
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
    <div className="flex w-full justify-center items-center">
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
  const [fileStatus, setFileStatus] = useState<FileStatus>({
    hasFiles: false,
    fileCount: 0,
    loading: true,
  });

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

  return (
    <>
      <Card onClick={() => setShowUploader(true)} className="cursor-pointer">
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
