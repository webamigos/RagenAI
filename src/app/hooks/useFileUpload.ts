import { useState, useCallback } from 'react';
import { useOrganization } from '@/app/hooks/use-auth';
import { useRouter } from 'next/navigation';

import { statusToast } from '../lib/utils/toast';
import { uploadProjectFiles } from '../lib/services/api';
import { processFileType } from '../lib/utils/fileValidation';

/**
 * Custom hook for managing file uploads
 */
export function useFileUpload(projectPublicId: string) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const { organization } = useOrganization();
  const { successToast, errorToast } = statusToast();
  const router = useRouter();

  /**
   * Handles adding new files and processing them for proper MIME types
   */
  const handleFilesAdded = useCallback((newFiles: File[]) => {
    const processedFiles = newFiles.map(processFileType);
    setFiles((prevFiles) => [...prevFiles, ...processedFiles]);
  }, []);

  /**
   * Removes a file at the specified index
   */
  const handleFileRemove = useCallback(
    (index: number) => {
      if (!uploading) {
        setFiles((prevFiles) => {
          const newFiles = [...prevFiles];
          newFiles.splice(index, 1);
          return newFiles;
        });
      }
    },
    [uploading]
  );

  /**
   * Uploads the files to the server
   */
  const uploadFiles = useCallback(async () => {
    if (!files.length || !organization) {
      errorToast({ message: 'No files to upload or missing organization' });
      return false;
    }

    setUploading(true);
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('projectId', projectPublicId);

    try {
      await uploadProjectFiles(projectPublicId, formData);
      successToast({ message: 'Files uploaded successfully' });
      setFiles([]);
      router.refresh();
      return true;
    } catch (error) {
      errorToast({ message: `Error sending files: ${error}` });
      return false;
    } finally {
      setUploading(false);
    }
  }, [files, organization, projectPublicId, errorToast, successToast, router]);

  return {
    files,
    uploading,
    handleFilesAdded,
    handleFileRemove,
    uploadFiles,
  };
}
