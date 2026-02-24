'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Card } from '@ragenai/common-ui/Card';
import { FileUploader } from '@ragenai/common-ui/FileUploader';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { uploadFiles } from '@/app/lib/services/api';
import { useSettings } from '@/app/hooks/useSettings';

import { UploadList } from './UploadList';
import { useRouter } from '@/i18n/routing';

export const UploadKnowledge = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const { push } = useRouter();
  const [_, startTransition] = useTransition();

  // const { refreshFiles } = useUserFilesContext(); // Moved to worker
  const { infoToast, errorToast } = statusToast();
  const t = useTranslations('admin-panel');
  const { refreshSettings } = useSettings();

  const handleFilesAdded = (newFiles: File[]) => {
    //To refactor
    const processedFiles = newFiles.map((file) => {
      if (file.name.endsWith('.md')) {
        // Added this line to fix the issue with mime type detection, it fallback to application/octet-stream while uploading markdown files
        return new File([file], file.name, { type: 'text/markdown' });
      }
      if (file.name.endsWith('.srt')) {
        // Set correct MIME type for SRT subtitle files
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
      errorToast({ message: t('no-files') });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    // security breach - everyone can set any organization
    // do not use this kind of credentials in requests
    // formData.append('organizationId', organization.id);

    try {
      const response = await uploadFiles(formData);
      if (response.status === 200) {
        infoToast({ message: t('success') });
        setFiles([]);
        // refreshFiles();
        startTransition(() => {
          push('/settings/knowledge/documents-list');
        });
        refreshSettings();
      } else {
        errorToast({ message: `${t('error')}: ${response.message}` });
      }
    } catch (error) {
      errorToast({ message: `${t('sending-files-error')}: ${error}` });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-6" size="full">
      <FileUploader onFilesAdded={handleFilesAdded} disabled={uploading} />
      {files.length > 0 && (
        <UploadList
          files={files}
          onRemoveFile={handleFileRemove}
          uploading={uploading}
        />
      )}
      <div className="w-full flex justify-center">
        <Button
          disabled={uploading || files.length < 1}
          className="mt-5"
          isLoading={uploading}
          isSubmit={!uploading}
          onClick={handleSend}
        >
          {t('send')}
        </Button>
      </div>
    </Card>
  );
};
