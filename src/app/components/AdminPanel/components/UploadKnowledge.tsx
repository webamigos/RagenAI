'use client';

import { useState } from 'react';
import { Card, Button, FileUploader } from '@salesyy/common-ui';
import { logger } from '@/app/lib/utils/logger';
import { useToast } from '@/app/hooks/useToast';
import { FileList } from './FileList';

export const UploadKnowledge = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const { successToast, errorToast } = useToast();

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
      errorToast({ message: 'Nie wybrano żadnych plików do wysłania.' });
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
          message: 'Wszystkie pliki zostały pomyślnie przetworzone.',
        });
        setFiles([]);
      } else {
        const data = await response.json();
        errorToast({ message: `Wystąpił błąd: ${data.message}` });
      }
    } catch (error) {
      logger.error('Błąd:', error);
      errorToast({ message: 'Wystąpił błąd podczas wysyłania plików.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card size="full">
      <FileUploader onFilesAdded={handleFilesAdded} disabled={uploading} />
      {files.length > 0 && (
        <FileList
          files={files}
          onRemoveFile={handleFileRemove}
          uploading={uploading}
        />
      )}
      <Button
        label={uploading ? 'Wysyłanie...' : 'Wyślij'}
        onClick={handleSend}
        disabled={uploading}
      />
    </Card>
  );
};
