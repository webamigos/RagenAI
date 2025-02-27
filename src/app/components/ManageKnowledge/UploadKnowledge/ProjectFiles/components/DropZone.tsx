import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Text, UploadInboxIcon } from '@ragenai/common-ui';
import { isSupportedFile } from '@/app/lib/utils/fileValidation';

type DropZoneProps = {
  onFilesDropped: (files: File[]) => void;
  children: React.ReactNode;
  t: any;
};

export const DropZone = memo(
  ({ onFilesDropped, children, t }: DropZoneProps) => {
    const { isOver, setNodeRef } = useDroppable({ id: 'files-list-droppable' });

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
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

    return (
      <div
        className={`w-full p-4 relative transition-all duration-200 ${
          isOver
            ? 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : ''
        }`}
        ref={setNodeRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {isOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 z-10 rounded-md">
            <div className="text-center">
              <UploadInboxIcon className="w-12 h-12 mx-auto text-blue-500 mb-2" />
              <Text className="text-blue-600 font-medium">
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
