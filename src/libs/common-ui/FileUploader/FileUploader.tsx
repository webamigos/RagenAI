'use client';

import { useRef, type ComponentPropsWithRef } from 'react';
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

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    const droppedFiles = Array.from(event.dataTransfer.files).filter(
      isSupportedFile,
    );
    onFilesAdded(droppedFiles);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) =>
    event.preventDefault();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const selectedFiles = Array.from(event.target.files || []).filter(
      isSupportedFile,
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
        onClick={handleClick}
        className={classMerge(
          'mb-5 p-5 text-center border-2 border-dashed dark:border-gray-600 rounded-md',
          { 'bg-gray-100 dark:bg-gray-800': true }, // TODO: change after file is over this box
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
