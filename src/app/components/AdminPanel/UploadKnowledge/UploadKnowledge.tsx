'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUser } from '@clerk/nextjs';
import { Card, Button, FileUploader } from '@salesyy/common-ui';
import { useToast } from '@/app/hooks/useToast';
import { FileList } from './FileList';
import { uploadFiles } from '@/app/lib/services/api';

export const UploadKnowledge = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);

  const { successToast, errorToast } = useToast();
  const t = useTranslations('admin-panel');
  const { user } = useUser();

  const userId = user?.publicMetadata?.visitorId || null;

  const handleFilesAdded = (newFiles: File[]) =>
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);

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

    try {
      const response = await uploadFiles(userId as string, formData);
      if (response.status === 200) {
        successToast({ message: t('success') });
        setFiles([]);
      } else {
        errorToast({ message: `${t('error')}: ${response.statusText}` });
      }
    } catch (error) {
      errorToast({ message: `${t('sending-files-error')}: ${error}` });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card title={t('Add-files')} size="full">
      <FileUploader onFilesAdded={handleFilesAdded} disabled={uploading} />
      {files.length > 0 && (
        <FileList
          files={files}
          onRemoveFile={handleFileRemove}
          uploading={uploading}
        />
      )}
      <Button
        label={uploading ? t('sending') : t('send')}
        onClick={handleSend}
        disabled={uploading}
      />
    </Card>
  );
};
