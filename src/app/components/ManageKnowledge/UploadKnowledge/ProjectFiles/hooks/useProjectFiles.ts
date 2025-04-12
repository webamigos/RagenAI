import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';
import { statusToast } from '@/app/lib/utils/toast';
import { deleteProjectFileAction, getProjectFiles } from '@/app/actions';
import { uploadProjectFiles } from '@/app/lib/services/api';
import { FileType } from '@prisma/client';

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
  organization_id: string;
};

export const useProjectFiles = (
  projectId: number,
  projectPublicId: string | undefined,
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
  const { organization } = useOrganization();
  const router = useRouter();
  const { successToast, errorToast } = statusToast();

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

      if (onFilesLoaded) {
        onFilesLoaded(loadedFiles.length > 0);
      }
    } catch (error) {
      setError('Failed to load project files');
      setListState(FileListState.ERROR);
      if (onFilesLoaded) {
        onFilesLoaded(false);
      }
    }
  }, [organization, projectId, onFilesLoaded]);

  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      if (!organization || deletingFileId) return;

      try {
        setDeletingFileId(fileId);
        const result = await deleteProjectFileAction(fileId, projectId);

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
    [
      organization,
      deletingFileId,
      projectId,
      successToast,
      errorToast,
      loadFiles,
      router,
    ]
  );

  const handleUploadFiles = useCallback(
    async (filesToUpload: File[]) => {
      if (!organization || !projectPublicId || isUploading) return;

      setIsUploading(true);

      const formData = new FormData();
      filesToUpload.forEach((file) => formData.append('files', file));
      formData.append('organizationId', organization.id);
      formData.append('projectId', projectId.toString());

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
      projectId,
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
