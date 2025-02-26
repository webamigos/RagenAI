'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';

import { FileUploader } from '@ragenai/common-ui/FileUploader';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { useRouter } from 'next/navigation';
import { UploadList } from '../UploadList';
import { uploadProjectFiles } from '@/app/lib/services/api';

type Props = {
  projectId: number;
  projectPublicId: string;
};

export const ProjectFileUpload = ({ projectId, projectPublicId }: Props) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const router = useRouter();
  const { successToast, errorToast } = statusToast();
  const t = useTranslations('projects');
  const { organization } = useOrganization();

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
    } catch (error) {
      errorToast({ message: `Error sending files: ${error}` });
    } finally {
      setUploading(false);
    }
  };

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
