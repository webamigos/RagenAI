import { useState, useCallback, useRef } from 'react';
import { useRouter } from '@/i18n/routing';
import { statusToast } from '@/app/lib/utils/toast';
import { deleteProjectFileAction } from '@/app/actions';
import { getProjectFilesQuery as getProjectFiles } from '@/features/documents/services/queries/get-project-files-query';
import { uploadProjectFiles } from '@/app/lib/services/api';
import { type FileType, type UserFile } from '@/generated/prisma/browser';
import { useTranslations } from 'next-intl';

export enum FileListState {
  LOADING,
  ERROR,
  EMPTY,
  HAS_FILES,
}

type ProjectFile = {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: FileType;
  createdAt: Date | null;
  updatedAt?: Date | null;
  metadata?: any;
};

export const useProjectFiles = (
  projectId: string,
  onFilesLoaded?: (hasFiles: boolean) => void,
) => {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [listState, setListState] = useState<FileListState>(
    FileListState.LOADING,
  );
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('projects');
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const initialLoadComplete = useRef(false);
  const router = useRouter();
  const { infoToast, errorToast } = statusToast();

  const loadFiles = useCallback(async () => {
    try {
      if (!initialLoadComplete.current) {
        setListState(FileListState.LOADING);
      }

      if (projectId) {
        const loadedFiles = await getProjectFiles(projectId);
        setFiles(loadedFiles);
        setListState(
          loadedFiles.length > 0
            ? FileListState.HAS_FILES
            : FileListState.EMPTY,
        );
        initialLoadComplete.current = true;

        if (onFilesLoaded) {
          onFilesLoaded(loadedFiles.length > 0);
        }
      }
    } catch (error) {
      setError('Failed to load project files');
      setListState(FileListState.ERROR);
      if (onFilesLoaded) {
        onFilesLoaded(false);
      }
    }
  }, [projectId, onFilesLoaded]);

  const handleDeleteFile = useCallback(
    async (publicFileId: UserFile['id']) => {
      if (deletingFileId) {
        return;
      }

      try {
        setDeletingFileId(publicFileId);
        const result = await deleteProjectFileAction(publicFileId, projectId);

        if (result.error) {
          throw new Error(result.error);
        }

        infoToast({ message: t('file-deleted') });
        loadFiles();
        router.refresh();
      } catch (error) {
        errorToast({ message: t('file-delete-fail') });
      } finally {
        setDeletingFileId(null);
      }
    },
    [deletingFileId, infoToast, errorToast, loadFiles, router],
  );

  const handleUploadFiles = useCallback(
    async (filesToUpload: File[]) => {
      if (!projectId || isUploading) {
        return;
      }

      setIsUploading(true);

      const formData = new FormData();
      filesToUpload.forEach((file) => formData.append('files', file));
      formData.append('projectId', projectId);

      try {
        await uploadProjectFiles(projectId, formData);
        infoToast({ message: t('file-uploaded') });
        loadFiles();
        router.refresh();
      } catch (error) {
        errorToast({ message: t('file-upload-fail') });
      } finally {
        setIsUploading(false);
      }
    },
    [projectId, isUploading, infoToast, loadFiles, router, errorToast],
  );

  return {
    files,
    listState,
    error,
    deletingFileId,
    isUploading,
    loadFiles,
    handleDeleteFile,
    handleUploadFiles,
  };
};
