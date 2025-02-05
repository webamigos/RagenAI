'use client';

import { useRef, ComponentPropsWithRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import {
  UploadInboxIcon,
  Text,
  Tooltip,
  InformationCircle,
} from '@ragenai/common-ui';

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
  const { isOver, setNodeRef } = useDroppable({ id: 'droppable' });
  const t = useTranslations('admin-panel');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSupportedFile = (file: File) =>
    file.type === 'text/markdown' ||
    file.type === 'application/epub+zip' ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.epub') ||
    file.name.endsWith('.pdf') ||
    file.name.endsWith('.srt');

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    const droppedFiles = Array.from(event.dataTransfer.files).filter(
      isSupportedFile
    );
    onFilesAdded(droppedFiles);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) =>
    event.preventDefault();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const selectedFiles = Array.from(event.target.files || []).filter(
      isSupportedFile
    );
    onFilesAdded(selectedFiles);

    event.target.value = '';
  };

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  return (
    <>
      <div
        ref={setNodeRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`mb-5 p-5 text-center border-2 border-dashed dark:border-gray-600 rounded-md ${className}`}
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
          color="blue-600"
          className="cursor-pointer"
          onClick={handleClick}
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
