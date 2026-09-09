import { memo, useState } from 'react';

import { Text } from '@ragenai/common-ui/Text';
import { UploadInboxIcon } from '@ragenai/common-ui/icons';
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
        isSupportedFile,
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
            ? 'border-2 border-primary bg-accent/70 dark:bg-primary/20 scale-[1.01] shadow-md'
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
          <div className="absolute inset-0 flex items-center justify-center bg-accent/70 dark:bg-primary/20 z-10 rounded-md">
            <div className="text-center p-5 bg-white/90 dark:bg-paper-800/90 rounded-lg shadow-md transform scale-105">
              <UploadInboxIcon className="w-12 h-12 mx-auto text-primary mb-3" />
              <Text className="text-primary font-medium">
                {t('upload.drop-to-upload')}
              </Text>
            </div>
          </div>
        )}
        {children}
      </div>
    );
  },
);

DropZone.displayName = 'DropZone';
