'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';

import { Card, FileUploader, Button } from '@ragenai/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { uploadFiles } from '@/app/lib/services/api';
import { useUserDocumentsContext } from '@/app/hooks/useUserDocumentsContext';
import { useSettings } from '@/app/hooks/useSettings';

import { UploadList } from './UploadList';
import { useRouter } from 'next/navigation';

export const UploadKnowledge = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const { push } = useRouter();
  const [_, startTransition] = useTransition();

  const { refreshDocuments } = useUserDocumentsContext();
  const { successToast, errorToast } = statusToast();
  const t = useTranslations('admin-panel');
  const { organization } = useOrganization();
  const { refreshSettings } = useSettings();

  if (!organization) {
    return;
  }

  const orgId = organization.id;

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
    formData.append('organizationId', organization.id);

    try {
      const response = await uploadFiles(orgId, formData);
      if (response.status === 200) {
        successToast({ message: t('success') });
        setFiles([]);
        refreshDocuments();
        startTransition(() => {
          push('/manage-knowledge/documents-list');
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
    <Card className="p-6" size="full" title={t('Add-files')}>
      <FileUploader onFilesAdded={handleFilesAdded} disabled={uploading} />
      {files.length > 0 && (
        <UploadList
          files={files}
          onRemoveFile={handleFileRemove}
          uploading={uploading}
        />
      )}
      <Button
        disabled={uploading || files.length < 1}
        className="mt-5"
        isLoading={uploading}
        isSubmit={!uploading}
        onClick={handleSend}
        label={t('send')}
      />
    </Card>
  );
};
