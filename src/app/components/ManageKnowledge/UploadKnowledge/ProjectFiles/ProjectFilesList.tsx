'use client';

import { useEffect, useRef, memo } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';
import { Card, Text } from '@ragenai/common-ui';
import { Skeleton } from '@/app/components';
import { FileUploader } from '@ragenai/common-ui/FileUploader';

import { FileItem } from './components/FileItem';
import { DropZone } from './components/DropZone';
import { useProjectFiles, FileListState } from './hooks/useProjectFiles';

type Props = {
  projectId: number;
  onFilesLoaded?: (hasFiles: boolean) => void;
  projectPublicId?: string;
  initialFileCount?: number;
};

export const ProjectFilesList = memo(
  ({
    projectId,
    onFilesLoaded,
    projectPublicId,
    initialFileCount = 0,
  }: Props) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const t = useTranslations('projects');
    const { organization } = useOrganization();

    const {
      files,
      listState,
      error,
      deletingFileId,
      isUploading,
      loadFiles,
      handleDeleteFile,
      handleUploadFiles,
    } = useProjectFiles(projectId, projectPublicId, onFilesLoaded);

    useEffect(() => {
      if (organization) {
        loadFiles();
      }
    }, [organization, loadFiles]);

    const handleFileSelect = () => {
      fileInputRef.current?.click();
    };

    const handleFileInputChange = (
      event: React.ChangeEvent<HTMLInputElement>
    ) => {
      const selectedFiles = Array.from(event.target.files || []);
      if (selectedFiles.length > 0) {
        handleUploadFiles(selectedFiles);
      }
      if (event.target) {
        event.target.value = '';
      }
    };

    if (!organization) {
      return null;
    }

    if (listState === FileListState.LOADING) {
      if (initialFileCount > 0) {
        return (
          <Card className="w-full p-6 min-h-[400px]">
            <div className="flex justify-between items-center mb-4">
              <Skeleton height="h-7" width="w-32" />
              <Skeleton height="h-7" width="w-24" />
            </div>
            <div className="space-y-2">
              {[...Array(initialFileCount)].map((_, index) => (
                <Skeleton key={index} height="h-16" width="w-full" />
              ))}
            </div>
          </Card>
        );
      }
      return (
        <FileUploader onFilesAdded={handleUploadFiles} disabled={isUploading} />
      );
    }

    if (listState === FileListState.ERROR) {
      return (
        <Card className="w-full p-6 min-h-[400px] flex items-center justify-center">
          <Text className="text-red-500">{error}</Text>
        </Card>
      );
    }

    return (
      <DropZone onFilesDropped={handleUploadFiles} t={t}>
        <div className="relative min-h-[400px]">
          <div className="flex justify-between items-center mb-4">
            <Text className="text-lg font-medium">{t('project-files')}</Text>
            <button
              onClick={handleFileSelect}
              className="px-2 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
              title={t('upload.add-files')}
            >
              + {t('upload.add-files')}
            </button>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".md,.epub,.srt,.pdf"
              multiple
              onChange={handleFileInputChange}
            />
          </div>

          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 z-10 rounded-md">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-t-blue-500 rounded-full animate-spin mx-auto mb-2"></div>
                <Text className="text-gray-600 dark:text-gray-300 font-medium">
                  {t('upload.uploading')}
                </Text>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {files.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                onDelete={() => handleDeleteFile(file.id)}
                isDeleting={deletingFileId === file.id}
                t={t}
              />
            ))}
          </div>
        </div>
      </DropZone>
    );
  }
);

ProjectFilesList.displayName = 'ProjectFilesList';
