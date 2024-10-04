'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUser } from '@clerk/nextjs';

import { Card, Button, FileUploader } from '@salesyy/common-ui';
import { UserRole } from '@/app/contracts/User';
import { statusToast } from '@/app/lib/utils/toast';
import { uploadFiles } from '@/app/lib/services/api';
import { useUserDocumentsContext } from '@/app/hooks/useUserDocumentsContext';

import { UploadList } from './UploadList';

export const UploadKnowledge = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);

  const { refreshDocuments } = useUserDocumentsContext();
  const { successToast, errorToast } = statusToast();
  const t = useTranslations('admin-panel');
  const { user } = useUser();

  const role = user?.publicMetadata?.role as UserRole;

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
      const response = await uploadFiles(role, formData);
      if (response.status === 200) {
        successToast({ message: t('success') });
        setFiles([]);
        refreshDocuments();
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
        <UploadList
          files={files}
          onRemoveFile={handleFileRemove}
          uploading={uploading}
        />
      )}
      <Button
        className="mt-5"
        label={uploading ? t('sending') : t('send')}
        onClick={handleSend}
        disabled={uploading || files.length < 1}
      />
    </Card>
  );
};
