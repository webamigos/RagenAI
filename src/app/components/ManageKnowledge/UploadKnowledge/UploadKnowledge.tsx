'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Card } from '@ragenai/common-ui/Card';
import { FileUploader } from '@ragenai/common-ui/FileUploader';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { uploadFiles } from '@/app/lib/services/api';
import { useSettings } from '@/app/hooks/useSettings';
import { useUserFilesContext } from '@/app/hooks/useUserFilesContext';
import { getFileType } from '@/app/lib/utils/getFileType';
import { EmbeddingStatus, ParsingStatus } from '@/generated/prisma/browser';

import { UploadList } from './UploadList';
import { useRouter } from '@/i18n/routing';

export const UploadKnowledge = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const { push } = useRouter();
  const [_, startTransition] = useTransition();

  const { addFile } = useUserFilesContext();
  const { infoToast, errorToast } = statusToast();
  const t = useTranslations('admin-panel');
  const { refreshSettings } = useSettings();

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
      errorToast({ message: t('no-files') });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    try {
      const response = await uploadFiles(formData);
      if (response.status === 200) {
        infoToast({ message: t('success') });

        // Optimistic update: add uploaded files to the list with "Processing" status
        for (let i = 0; i < response.files.length; i++) {
          const uploaded = response.files[i];
          const originalFile = files[i];
          addFile({
            public_id: uploaded.uniqueFileId,
            organization_id: '',
            file_name: uploaded.fileName,
            file_size: uploaded.fileSize,
            file_type: getFileType(uploaded.fileName),
            project_id: null,
            project: null,
            document: null,
            created_at: new Date(),
            embedding_status: EmbeddingStatus.NOT_STARTED,
            parsing_status: ParsingStatus.NOT_STARTED,
          });
        }

        setFiles([]);
        startTransition(() => {
          push('/knowledge/documents-list');
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
          className="mt-5 min-w-[160px]"
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
