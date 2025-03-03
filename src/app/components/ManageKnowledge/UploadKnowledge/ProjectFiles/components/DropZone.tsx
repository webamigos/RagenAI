import { memo, useState } from 'react';
import { Text, UploadInboxIcon } from '@ragenai/common-ui';
import { isSupportedFile } from '@/app/lib/utils/fileValidation';

type DropZoneProps = {
  onFilesDropped: (files: File[]) => void;
  children: React.ReactNode;
  t: any;
};

export const DropZone = memo(
  ({ onFilesDropped, children, t }: DropZoneProps) => {
    const [dragCounter, setDragCounter] = useState(0);
    const isDragging = dragCounter > 0;

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragCounter(0);

      const droppedFiles = Array.from(event.dataTransfer.files).filter(
        isSupportedFile
      );
      if (droppedFiles.length > 0) {
        onFilesDropped(droppedFiles);
      }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    };

    const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragCounter((prev) => prev + 1);
    };

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragCounter((prev) => Math.max(0, prev - 1));
    };

    return (
      <div
        className={`w-full p-4 relative transition-all duration-300 ${
          isDragging
            ? 'border-2 border-blue-400 bg-blue-50/70 dark:bg-blue-900/20 scale-[1.01] shadow-md'
            : ''
        }`}
        style={
          isDragging ? { boxShadow: '0 0 8px rgba(59, 130, 246, 0.3)' } : {}
        }
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      >
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-50/70 dark:bg-blue-900/20 z-10 rounded-md">
            <div className="text-center p-5 bg-white/90 dark:bg-accent-dark-600/90 rounded-lg shadow-md transform scale-105">
              <UploadInboxIcon className="w-12 h-12 mx-auto text-blue-500 mb-3" />
              <Text className="text-blue-600 dark:text-blue-400 font-medium">
                {t('upload.drop-to-upload')}
              </Text>
            </div>
          </div>
        )}
        {children}
      </div>
    );
  }
);

DropZone.displayName = 'DropZone';
