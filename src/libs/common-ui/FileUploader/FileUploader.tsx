'use client';

import { useRef, useState, type ComponentPropsWithRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { UploadInboxIcon } from '@ragenai/common-ui/icons';
import { Text } from '@ragenai/common-ui/Text';
import { classMerge } from '@ragenai/common-ui/utils/cn';

import { isSupportedFile } from '@/app/lib/utils/fileValidation';
interface FileUploaderProps extends ComponentPropsWithRef<'div'> {
  onFilesAdded: (files: File[]) => void;
  disabled?: boolean;
}

export const FileUploader = ({
  onFilesAdded,
  disabled,
  className,
  ...props
}: FileUploaderProps) => {
  const { setNodeRef } = useDroppable({ id: 'droppable' });
  const t = useTranslations('admin-panel');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    if (disabled) {
      return;
    }
    const droppedFiles = Array.from(event.dataTransfer.files).filter(
      isSupportedFile,
    );
    onFilesAdded(droppedFiles);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) =>
    event.preventDefault();

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    dragCounter.current += 1;
    if (dragCounter.current === 1) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }
    const selectedFiles = Array.from(event.target.files || []).filter(
      isSupportedFile,
    );
    onFilesAdded(selectedFiles);

    event.target.value = '';
  };

  const handleClick = () => {
    if (disabled) {
      return;
    }
    fileInputRef.current?.click();
  };

  return (
    <>
      <div
        ref={setNodeRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        className={classMerge(
          'mb-5 p-5 text-center border-2 border-dashed rounded-md transition-colors',
          isDragOver
            ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
            : 'border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-800',
          className,
        )}
        {...props}
      >
        <div className="flex justify-center items-center cursor-pointer">
          <Text
            fontSize="sm"
            fontWeight="medium"
            className="mr-2 dark:text-gray-200"
          >
            {t('drag-n-drop')}
          </Text>
          <UploadInboxIcon className="dark:text-gray-200" />
        </div>
        <Text fontSize="sm" fontWeight="medium" className="dark:text-gray-200">
          {t('or')}
        </Text>
        <Text
          fontSize="sm"
          fontWeight="medium"
          className="cursor-pointer text-blue-600"
        >
          {t('choose-files')}
        </Text>
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".md,.epub,.srt,.pdf"
          multiple
          onChange={handleFileSelect}
        />
      </div>
      <Text
        fontWeight="light"
        fontSize="sm"
        color="gray-500"
        className="mt-4 w-full flex justify-center"
      >
        {t('supported-formats')}: .pdf, .md, .epub, .srt
      </Text>
    </>
  );
};
