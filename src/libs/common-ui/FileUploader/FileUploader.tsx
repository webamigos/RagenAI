'use client';

import { useRef, ComponentPropsWithRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import {
  UploadInboxIcon,
  Text,
  QuestionMarkCircle,
  Tooltip,
} from '@salesyy/common-ui';

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
          <Text fontSize="sm" fontWeight="medium" className="mr-2">
            {t('drag-n-drop')}
          </Text>
          <UploadInboxIcon />
        </div>
        <Text fontSize="sm" fontWeight="medium">
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
          accept=".md,.epub"
          multiple
          onChange={handleFileSelect}
        />
      </div>
      <Text fontWeight="light" fontSize="sm" color="gray-500" className="-mt-4">
        <Tooltip
          id="supported formats"
          content={`${t('supported-formats')}: .md, .epub`}
        >
          <QuestionMarkCircle className="cursor-pointer" />
        </Tooltip>
      </Text>
    </>
  );
};
