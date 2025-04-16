import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { statusToast } from '@/app/lib/utils/toast';
import { deleteProjectFileAction, getProjectFiles } from '@/app/actions';
import { uploadProjectFiles } from '@/app/lib/services/api';
import { FileType, UserFile } from '@prisma/client';

export enum FileListState {
  LOADING,
  ERROR,
  EMPTY,
  HAS_FILES,
}

type ProjectFile = {
  public_id: string;
  file_name: string;
  file_size: number;
  file_type: FileType;
  created_at: Date | null;
  updated_at?: Date | null;
  metadata?: any;
};

export const useProjectFiles = (
  projectPublicId: string,
  onFilesLoaded?: (hasFiles: boolean) => void
) => {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [listState, setListState] = useState<FileListState>(
    FileListState.LOADING
  );
  const [error, setError] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const initialLoadComplete = useRef(false);
  const router = useRouter();
  const { successToast, errorToast } = statusToast();

  const loadFiles = useCallback(async () => {
    try {
      if (!initialLoadComplete.current) {
        setListState(FileListState.LOADING);
      }

      if (projectPublicId) {
        const result = await getProjectFiles(projectPublicId);

        if (result.error) {
          throw new Error(result.error);
        }

        const loadedFiles = result.files || [];
        setFiles(loadedFiles);
        setListState(
          loadedFiles.length > 0 ? FileListState.HAS_FILES : FileListState.EMPTY
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
  }, [projectPublicId, onFilesLoaded]);

  const handleDeleteFile = useCallback(
    async (publicFileId: UserFile['public_id']) => {
      if (deletingFileId) return;

      try {
        setDeletingFileId(publicFileId);
        const result = await deleteProjectFileAction(
          publicFileId,
          projectPublicId
        );

        if (result.error) {
          throw new Error(result.error);
        }

        successToast({ message: 'File deleted successfully' });
        loadFiles();
        router.refresh();
      } catch (error) {
        errorToast({ message: 'Failed to delete file' });
      } finally {
        setDeletingFileId(null);
      }
    },
    [organization, deletingFileId, successToast, errorToast, loadFiles, router]
  );

  const handleUploadFiles = useCallback(
    async (filesToUpload: File[]) => {
      if (!organization || !projectPublicId || isUploading) return;

      setIsUploading(true);

      const formData = new FormData();
      filesToUpload.forEach((file) => formData.append('files', file));
      formData.append('organizationId', organization.id);
      formData.append('projectId', projectPublicId);

      try {
        await uploadProjectFiles(projectPublicId, formData);
        successToast({ message: 'Files uploaded successfully' });
        loadFiles();
        router.refresh();
      } catch (error) {
        errorToast({ message: 'Failed to upload files' });
      } finally {
        setIsUploading(false);
      }
    },
    [
      organization,
      projectPublicId,
      isUploading,
      successToast,
      loadFiles,
      router,
      errorToast,
    ]
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
