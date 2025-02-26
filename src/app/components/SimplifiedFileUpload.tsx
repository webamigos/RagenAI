'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';
import { FileUploader, Button, Text } from '@ragenai/common-ui';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { statusToast } from '@/app/lib/utils/toast';
import { useRouter } from 'next/navigation';

type Props = {
  projectId: number;
  projectPublicId: string;
};

export const SimplifiedFileUpload = ({ projectId, projectPublicId }: Props) => {
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
      const response = await fetch(`/api/upload/project/${projectPublicId}`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        successToast({ message: 'Files uploaded successfully' });
        setFiles([]);
        router.refresh();
      } else {
        errorToast({ message: `Error: ${data.message}` });
      }
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
            <div className="mt-4">
              <Text className="font-medium mb-2">
                {t('upload.selected-files')}
              </Text>
              <ul className="space-y-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between bg-gray-50 dark:bg-accent-dark-500 p-2 rounded"
                  >
                    <span className="truncate max-w-[300px]">{file.name}</span>
                    <button
                      onClick={() => handleFileRemove(index)}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      disabled={uploading}
                      title={t('upload.remove-file')}
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Button
          disabled={uploading || files.length < 1}
          isLoading={uploading}
          isSubmit={!uploading}
          onClick={handleSend}
          label={
            files.length
              ? t('upload.button-with-count', { count: files.length })
              : t('upload.button')
          }
        />
      </div>
    </div>
  );
};
