'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';

import { FileUploader } from '@ragenai/common-ui/FileUploader';
import { Button } from '@ragenai/common-ui/Button';
import { Skeleton } from '@/app/components';
import { statusToast } from '@/app/lib/utils/toast';
import { useRouter } from 'next/navigation';
import { UploadList } from '../UploadList';
import { uploadProjectFiles } from '@/app/lib/services/api';
import { ProjectFilesList } from './ProjectFilesList';

type Props = {
  projectId: number;
  projectPublicId: string;
};

export const ProjectFileUpload = ({ projectId, projectPublicId }: Props) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [hasProjectFiles, setHasProjectFiles] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const router = useRouter();
  const { successToast, errorToast } = statusToast();
  const t = useTranslations('projects');
  const { organization } = useOrganization();

  const handleFilesLoaded = (hasFiles: boolean) => {
    setHasProjectFiles(hasFiles);
    setIsInitializing(false);
  };

  // Check for existing files when component mounts
  useEffect(() => {
    if (organization) {
      // Initial render - we'll use the ProjectFilesList component to check for existing files
      // The onFilesLoaded callback will update our state
    }
    // We're not returning anything from this effect, just making sure it runs after organization is available
  }, [projectId, organization]);

  if (!organization) {
    return null;
  }

  const orgId = organization.id;

  const handleFilesAdded = (newFiles: File[]) => {
    const processedFiles = newFiles.map((file) => {
      if (file.name.endsWith('.md')) {
        return new File([file], file.name, { type: 'text/markdown' });
      }
      if (file.name.endsWith('.srt')) {
        return new File([file], file.name, { type: 'application/x-subrip' });
      }
      return file;
    });
    setFiles((prevFiles) => [...prevFiles, ...processedFiles]);
  };

  const handleFileRemove = (index: number) => {
    if (!uploading) {
      setFiles((prevFiles) => {
        const newFiles = [...prevFiles];
        newFiles.splice(index, 1);
        return newFiles;
      });
    }
  };

  const handleSend = async () => {
    if (!files.length) {
      errorToast({ message: 'No files to upload' });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('organizationId', orgId);
    formData.append('projectId', projectId.toString());

    try {
      await uploadProjectFiles(projectPublicId, formData);
      successToast({ message: 'Files uploaded successfully' });
      setFiles([]);
      router.refresh();
      // Force refresh project files list after upload
      setHasProjectFiles(true);
    } catch (error) {
      errorToast({ message: `Error sending files: ${error}` });
    } finally {
      setUploading(false);
    }
  };

  // Show loading skeleton during initialization
  if (isInitializing) {
    return (
      <div className="p-4">
        <Skeleton height="h-6" width="w-48" className="mb-4" />
        <Skeleton height="h-32" width="w-full" className="mb-4" />
        <ProjectFilesList
          projectId={projectId}
          projectPublicId={projectPublicId}
          onFilesLoaded={handleFilesLoaded}
        />
      </div>
    );
  }

  // If project has files, only show file list
  if (hasProjectFiles) {
    return (
      <ProjectFilesList
        projectId={projectId}
        projectPublicId={projectPublicId}
        onFilesLoaded={handleFilesLoaded}
      />
    );
  }

  // Otherwise show the upload interface
  return (
    <div className="p-4">
      <h3 className="text-lg font-medium mb-4">{t('upload.title')}</h3>
      <div className="flex gap-4 items-start">
        <div className="flex-1">
          <FileUploader
            onFilesAdded={handleFilesAdded}
            disabled={uploading}
            className="min-h-0"
          />
          {files.length > 0 && (
            <UploadList
              files={files}
              onRemoveFile={handleFileRemove}
              uploading={uploading}
            />
          )}
        </div>
        <Button
          disabled={uploading || files.length < 1}
          isLoading={uploading}
          isSubmit={!uploading}
          onClick={handleSend}
          label={t('upload.button')}
          className="self-start mt-8"
        />
      </div>
    </div>
  );
};
