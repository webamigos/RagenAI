'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Card, Button, FileUploader } from '@salesyy/common-ui';
import { useToast } from '@/app/hooks/useToast';
import { FileList } from './FileList';

export const UploadKnowledge = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const { successToast, errorToast } = useToast();
  const t = useTranslations('admin-panel');

  const handleFilesAdded = (newFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
  };

  const handleFileRemove = (index: number) => {
    if (uploading) return;
    setFiles((prevFiles) => {
      const newFiles = [...prevFiles];
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleSend = async () => {
    if (files.length === 0) {
      errorToast({ message: t('no-files') });
      return;
    }

    setUploading(true);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        successToast({
          message: t('success'),
        });
        setFiles([]);
      } else {
        const data = await response.json();
        errorToast({ message: `${t('error')}: ${data.message}` });
      }
    } catch (error) {
      errorToast({ message: t('sending-files-error') });
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
