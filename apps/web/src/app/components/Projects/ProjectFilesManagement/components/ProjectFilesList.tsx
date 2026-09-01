'use client';

import { useEffect, useRef, memo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@ragenai/common-ui/Card';
import { Text } from '@ragenai/common-ui/Text';
import { LoadingSkeleton } from '@ragenai/common-ui/Skeleton';
import { FileUploader } from '@ragenai/common-ui/FileUploader';

import { FileItem } from '../../../ManageKnowledge/UploadKnowledge/ProjectFiles/components/FileItem';
import { DropZone } from '../../../ManageKnowledge/UploadKnowledge/ProjectFiles/components/DropZone';
import {
  useProjectFiles,
  FileListState,
} from '../../../ManageKnowledge/UploadKnowledge/ProjectFiles/hooks/useProjectFiles';
import type { Project } from '@/generated/prisma/browser';
import { KnowledgeBasePickerDialog } from '@/app/components/KnowledgeBasePickerDialog';
import { GoogleDriveFolderPickerDialog } from '@/app/components/GoogleDriveFolderPickerDialog';
import { importFilesToProject } from '@/app/actions';
import {
  isDriveConnected,
  importDriveFolder,
} from '@/app/actions/google-drive';
type Props = {
  onFilesLoaded?: (hasFiles: boolean) => void;
  projectId: Project['id'];
  initialFileCount?: number;
};

export const ProjectFilesList = memo(
  ({ onFilesLoaded, projectId, initialFileCount = 0 }: Props) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const t = useTranslations('projects');
    const [isKbPickerOpen, setIsKbPickerOpen] = useState(false);
    const [isDriveFolderPickerOpen, setIsDriveFolderPickerOpen] =
      useState(false);
    const [hasDriveConnector, setHasDriveConnector] = useState(false);
    const [isDriveImporting, setIsDriveImporting] = useState(false);
    const [driveImportError, setDriveImportError] = useState<string | null>(
      null,
    );

    const {
      files,
      listState,
      error,
      deletingFileId,
      isUploading,
      loadFiles,
      handleDeleteFile,
      handleUploadFiles,
    } = useProjectFiles(projectId, onFilesLoaded);

    useEffect(() => {
      isDriveConnected()
        .then(setHasDriveConnector)
        .catch(() => setHasDriveConnector(false));
    }, []);

    const handleDriveFolderSelected = async (
      folderId: string,
      folderName: string,
    ) => {
      setIsDriveImporting(true);
      setDriveImportError(null);
      try {
        const result = await importDriveFolder(folderId, folderName, projectId);
        if (!result.success) {
          setDriveImportError(result.error || 'Import failed');
        }
        loadFiles();
      } catch {
        setDriveImportError('Import failed');
      } finally {
        setIsDriveImporting(false);
      }
    };

    const handleKbFilesSelected = async (
      selected: {
        id: string;
        name: string;
        size: number;
        type: string;
      }[],
    ) => {
      const fileIds = selected.map((f) => f.id);
      await importFilesToProject(fileIds, projectId);
      loadFiles();
    };

    useEffect(() => {
      loadFiles();
    }, [loadFiles]);

    const handleFileSelect = () => {
      fileInputRef.current?.click();
    };

    const handleFileInputChange = (
      event: React.ChangeEvent<HTMLInputElement>,
    ) => {
      const selectedFiles = Array.from(event.target.files || []);
      if (selectedFiles.length > 0) {
        handleUploadFiles(selectedFiles);
      }
      if (event.target) {
        event.target.value = '';
      }
    };

    if (listState === FileListState.LOADING) {
      if (initialFileCount > 0) {
        return <LoadingSkeleton />;
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
            <Text className="text-lg font-medium text-gray-700 dark:text-gray-200">
              {t('project-files')}
            </Text>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsKbPickerOpen(true)}
                className="px-2 py-1 text-sm font-medium text-primary-blue-500 hover:text-primary-blue-400 hover:bg-gray-50 dark:text-gray-200 dark:hover:text-gray-100 dark:hover:bg-accent-dark-700 rounded transition-colors"
              >
                +{' '}
                {t('upload.from-knowledge-base', {
                  defaultMessage: 'From Knowledge Base',
                })}
              </button>
              {hasDriveConnector && (
                <button
                  onClick={() => {
                    setDriveImportError(null);
                    setIsDriveFolderPickerOpen(true);
                  }}
                  disabled={isDriveImporting}
                  className="px-2 py-1 text-sm font-medium text-primary-blue-500 hover:text-primary-blue-400 hover:bg-gray-50 dark:text-gray-200 dark:hover:text-gray-100 dark:hover:bg-accent-dark-700 rounded transition-colors disabled:opacity-50"
                >
                  +{' '}
                  {t('upload.from-google-drive', {
                    defaultMessage: 'From Google Drive',
                  })}
                </button>
              )}
              <button
                onClick={handleFileSelect}
                className="px-2 py-1 text-sm font-medium text-primary-blue-500 hover:text-primary-blue-400 hover:bg-gray-50 dark:text-gray-200 dark:hover:text-gray-100 dark:hover:bg-accent-dark-700 rounded transition-colors"
                title={t('upload.add-files')}
              >
                + {t('upload.add-files')}
              </button>
            </div>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".md,.epub,.srt,.pdf"
              multiple
              onChange={handleFileInputChange}
            />
          </div>

          {driveImportError && (
            <div className="mb-2 px-3 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
              {driveImportError}
            </div>
          )}

          {isDriveImporting && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-accent-dark-500/80 z-10 rounded-md">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-t-primary-blue-500 rounded-full animate-spin mx-auto mb-2"></div>
                <Text className="text-gray-600 dark:text-gray-300 font-medium">
                  {t('upload.importing-from-drive', {
                    defaultMessage: 'Importing from Google Drive...',
                  })}
                </Text>
              </div>
            </div>
          )}

          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-accent-dark-500/80 z-10 rounded-md">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-t-primary-blue-500 rounded-full animate-spin mx-auto mb-2"></div>
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
        <KnowledgeBasePickerDialog
          open={isKbPickerOpen}
          onOpenChange={setIsKbPickerOpen}
          onFilesSelected={handleKbFilesSelected}
        />

        <GoogleDriveFolderPickerDialog
          open={isDriveFolderPickerOpen}
          onOpenChange={setIsDriveFolderPickerOpen}
          mode="import"
          onFolderSelected={handleDriveFolderSelected}
        />
      </DropZone>
    );
  },
);

ProjectFilesList.displayName = 'ProjectFilesList';
