'use client';

import { useRef, ComponentPropsWithRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { Text } from '../Text';
import { UploadInboxIcon } from '@salesyy/common-ui/icons';

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

  const isMarkdownOrEpubFile = (file: File) =>
    file.type === 'text/markdown' ||
    file.type === 'application/epub+zip' ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.epub');

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;

    const droppedFiles = Array.from(event.dataTransfer.files).filter(
      isMarkdownOrEpubFile
    );
    onFilesAdded(droppedFiles);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) =>
    event.preventDefault();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;

    const selectedFiles = Array.from(event.target.files || []).filter(
      isMarkdownOrEpubFile
    );
    onFilesAdded(selectedFiles);
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
        className={`mb-5 p-5 text-center border-2 border-dashed rounded-md ${className}`}
        {...props}
      >
        <div className="flex justify-center items-center cursor-pointer">
          <Text fontWeight="light" className="mr-2">
            {t('drag-n-drop')}
          </Text>
          <UploadInboxIcon />
        </div>
        <Text fontWeight="light">{t('or')}</Text>
        <Text color="blue-600" className="cursor-pointer" onClick={handleClick}>
          {t('choose-files')}
        </Text>
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".md, .epub"
          multiple
          onChange={handleFileSelect}
        />
      </div>
      <Text fontSize="sm" color="gray-400" className="-mt-4">
        {`${t('supported-formats')}: .md, .epub`}
      </Text>
    </>
  );
};
