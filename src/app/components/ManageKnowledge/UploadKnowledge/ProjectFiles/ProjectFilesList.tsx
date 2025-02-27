'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';
import { useDroppable } from '@dnd-kit/core';
import prettyBytes from 'pretty-bytes';

import { Card, Text, TrashIcon, UploadInboxIcon } from '@ragenai/common-ui';
import { Skeleton, SkeletonList } from '@/app/components';

import { statusToast } from '@/app/lib/utils/toast';
import { deleteProjectFileAction, getProjectFiles } from '@/app/actions';
import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { SupportedFileType } from '@/app/lib/services/fileParser';
import { uploadProjectFiles } from '@/app/lib/services/api';
import { isSupportedFile } from '@/app/lib/utils/fileValidation';

enum FileListState {
  LOADING,
  ERROR,
  EMPTY,
  HAS_FILES,
}

const LoadingSkeleton = memo(() => {
  return (
    <Card className="w-full p-4">
      <div className="mb-4">
        <Skeleton height="h-6" width="w-32" />
      </div>
      <SkeletonList count={3} height="h-16" />
    </Card>
  );
});

LoadingSkeleton.displayName = 'LoadingSkeleton';

type Props = {
  projectId: number;
  onFilesLoaded?: (hasFiles: boolean) => void;
  projectPublicId?: string;
};

type ProjectFile = {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  created_at: Date | null;
  updated_at?: Date | null;
  metadata?: any;
  organization_id: string;
};

const FileItem = memo(
  ({
    file,
    onDelete,
    isDeleting,
  }: {
    file: ProjectFile & { formattedSize: string; formattedDate: string };
    onDelete: () => void;
    isDeleting: boolean;
  }) => {
    const t = useTranslations('projects');

    return (
      <div className="p-3 rounded-md border border-gray-200 dark:border-gray-700 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        <div className="h-8 w-8 text-gray-400 flex items-center justify-center">
          {getFileIcon(file.file_type as SupportedFileType)}
        </div>
        <div className="flex-1 min-w-0">
          <Text className="font-medium truncate">{file.file_name}</Text>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>{file.formattedSize}</span>
            <span>•</span>
            <span>{file.formattedDate}</span>
          </div>
        </div>
        <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
          {file.file_type}
        </span>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
          title={t('remove-file')}
        >
          {isDeleting ? (
            <div className="w-4 h-4 border-t-2 border-red-500 rounded-full animate-spin"></div>
          ) : (
            <TrashIcon className="w-4 h-4" />
          )}
        </button>
      </div>
    );
  }
);

FileItem.displayName = 'FileItem';

export const ProjectFilesList = ({
  projectId,
  onFilesLoaded,
  projectPublicId,
}: Props) => {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [listState, setListState] = useState<FileListState>(
    FileListState.LOADING
  );
  const [error, setError] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState({
    isDragging: false,
    isUploading: false,
  });

  const initialLoadComplete = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = useTranslations('projects');
  const { organization } = useOrganization();
  const router = useRouter();
  const { successToast, errorToast } = statusToast();

  // Drop zone setup
  const { isOver, setNodeRef } = useDroppable({ id: 'files-list-droppable' });

  useEffect(() => {
    setUploadState((prev) => ({ ...prev, isDragging: isOver }));
  }, [isOver]);

  // Funkcja ładująca pliki, zoptymalizowana przez useCallback
  const loadFiles = useCallback(async () => {
    if (!organization) return;

    try {
      if (!initialLoadComplete.current) {
        setListState(FileListState.LOADING);
      }

      const result = await getProjectFiles(projectId);

      if (result.error) {
        throw new Error(result.error);
      }

      const loadedFiles = result.files || [];
      setFiles(loadedFiles);
      setListState(
        loadedFiles.length > 0 ? FileListState.HAS_FILES : FileListState.EMPTY
      );
      initialLoadComplete.current = true;

      // Notify parent component
      if (onFilesLoaded) {
        onFilesLoaded(loadedFiles.length > 0);
      }
    } catch (error) {
      setError(
        t('error.loading-files') || 'Nie udało się załadować plików projektu'
      );
      setListState(FileListState.ERROR);

      // Also notify parent in case of error
      if (onFilesLoaded) {
        onFilesLoaded(false);
      }
    }
  }, [organization, projectId, t, onFilesLoaded]);

  // Efekt ładujący dane
  useEffect(() => {
    if (organization) {
      loadFiles();
    }
  }, [organization, loadFiles]);

  // Funkcja obsługująca usuwanie pliku
  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      if (!organization || deletingFileId) return;

      try {
        setDeletingFileId(fileId);
        const result = await deleteProjectFileAction(fileId, projectId);

        if (result.error) {
          throw new Error(result.error);
        }

        successToast({ message: t('file-deleted') });
        loadFiles();
        router.refresh();
      } catch (error) {
        errorToast({
          message: t('error.file-delete'),
        });
      } finally {
        setDeletingFileId(null);
      }
    },
    [
      organization,
      deletingFileId,
      projectId,
      t,
      successToast,
      errorToast,
      loadFiles,
      router,
    ]
  );

  // Funkcja obsługująca upuszczenie plików
  const handleFileDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setUploadState((prev) => ({ ...prev, isDragging: false }));

      if (!organization || !projectPublicId) return;

      const droppedFiles = Array.from(event.dataTransfer.files).filter(
        isSupportedFile
      );

      if (droppedFiles.length === 0) {
        errorToast({
          message: t('upload.no-supported-files'),
        });
        return;
      }

      await uploadFiles(droppedFiles);
    },
    [organization, projectPublicId, t, errorToast]
  );

  // Funkcje obsługujące przeciąganie
  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setUploadState((prev) => ({ ...prev, isDragging: true }));
    },
    []
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setUploadState((prev) => ({ ...prev, isDragging: false }));
    },
    []
  );

  // Funkcja obsługująca wybór plików
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files || []).filter(
        isSupportedFile
      );

      if (selectedFiles.length === 0) {
        errorToast({
          message: t('upload.no-supported-files'),
        });
        return;
      }

      await uploadFiles(selectedFiles);

      // Reset input
      if (event.target) {
        event.target.value = '';
      }
    },
    [t, errorToast]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const uploadFiles = useCallback(
    async (filesToUpload: File[]) => {
      if (!organization || !projectPublicId || uploadState.isUploading) return;

      setUploadState((prev) => ({ ...prev, isUploading: true }));

      const formData = new FormData();
      filesToUpload.forEach((file) => formData.append('files', file));
      formData.append('organizationId', organization.id);
      formData.append('projectId', projectId.toString());

      try {
        await uploadProjectFiles(projectPublicId, formData);
        successToast({
          message: t('upload.success'),
        });
        loadFiles();
        router.refresh();
      } catch (error) {
        errorToast({
          message: t('upload.error'),
        });
      } finally {
        setUploadState((prev) => ({ ...prev, isUploading: false }));
      }
    },
    [
      organization,
      projectPublicId,
      uploadState.isUploading,
      projectId,
      successToast,
      t,
      loadFiles,
      router,
      errorToast,
    ]
  );

  // Memoizujemy przeformatowane pliki, żeby uniknąć niepotrzebnych renderów
  const formattedFiles = useMemo(
    () =>
      files.map((file) => ({
        ...file,
        formattedSize: prettyBytes(file.file_size),
        formattedDate: file.created_at
          ? new Date(file.created_at).toLocaleDateString()
          : '-',
      })),
    [files]
  );

  // Renderowanie zawartości w zależności od stanu
  const renderContent = useCallback(() => {
    if (!organization) {
      return null;
    }

    if (listState === FileListState.LOADING) {
      return <LoadingSkeleton />;
    }

    if (listState === FileListState.ERROR) {
      return (
        <Card className="w-full p-6">
          <Text className="text-red-500">{error}</Text>
        </Card>
      );
    }

    if (listState === FileListState.EMPTY) {
      return (
        <Card className="w-full p-6 flex justify-center items-center">
          <Text className="text-gray-500 dark:text-gray-400">
            {t('no-files')}
          </Text>
        </Card>
      );
    }

    const { isDragging, isUploading } = uploadState;

    return (
      <div
        className={`w-full p-4 relative transition-all duration-200 ${
          isDragging
            ? 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : ''
        }`}
        ref={setNodeRef}
        onDrop={handleFileDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 z-10 rounded-md">
            <div className="text-center">
              <UploadInboxIcon className="w-12 h-12 mx-auto text-blue-500 mb-2" />
              <Text className="text-blue-600 font-medium">
                {t('upload.drop-to-upload')}
              </Text>
            </div>
          </div>
        )}

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

        <div className="flex justify-between items-center mb-4">
          <Text className="text-lg font-medium">{t('project-files')}</Text>
          <button
            onClick={handleClick}
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
            onChange={handleFileSelect}
          />
        </div>
        <div className="space-y-2">
          {formattedFiles.map((file) => (
            <FileItem
              key={file.id}
              file={file}
              onDelete={() => handleDeleteFile(file.id)}
              isDeleting={deletingFileId === file.id}
            />
          ))}
        </div>
      </div>
    );
  }, [
    organization,
    listState,
    error,
    t,
    uploadState,
    formattedFiles,
    setNodeRef,
    handleFileDrop,
    handleDragOver,
    handleDragLeave,
    handleClick,
    handleFileSelect,
    deletingFileId,
    handleDeleteFile,
  ]);

  return <div ref={containerRef}>{renderContent()}</div>;
};
