import { useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { UploadInboxIcon } from '@salesyy/common-ui/icons';
import { useTranslations } from 'next-intl';

interface FileUploaderProps {
  onFilesAdded: (files: File[]) => void;
  disabled?: boolean;
}

export const FileUploader = ({ onFilesAdded, disabled }: FileUploaderProps) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'droppable',
  });
  const t = useTranslations('admin-panel');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;

    const droppedFiles = Array.from(event.dataTransfer.files).filter((file) =>
      file.name.endsWith('.md')
    ) as File[];
    onFilesAdded(droppedFiles);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;

    const selectedFiles = Array.from(event.target.files || []).filter((file) =>
      file.name.endsWith('.md')
    );
    onFilesAdded(selectedFiles);
  };

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  return (
    <div
      className="mb-5 p-5 text-center border-2 border-dashed rounded-md"
      ref={setNodeRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="flex justify-center items-center cursor-pointer">
        <p className="mr-2">{t('drag-n-drop')}</p>
        <UploadInboxIcon />
      </div>
      <p>{t('or')}</p>
      <p className="text-blue-600 cursor-pointer" onClick={handleClick}>
        {t('choose-files')}
      </p>
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept=".md"
        multiple
        onChange={handleFileSelect}
      />
    </div>
  );
};
