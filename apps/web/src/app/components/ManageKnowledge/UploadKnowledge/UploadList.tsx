import { useTranslations } from 'next-intl';

import { Text } from '@ragenai/common-ui/Text';

import { FileItem } from './FileItem';

interface FileListProps {
  files: File[];
  onRemoveFile: (index: number) => void;
  uploading: boolean;
}

export const UploadList = ({
  files,
  onRemoveFile,
  uploading,
}: FileListProps) => {
  const t = useTranslations('admin-panel-page');

  return (
    <div className="mt-5">
      <Text
        fontSize="sm"
        fontWeight="medium"
        className="mb-2 text-zinc-500 dark:text-zinc-400"
      >
        {t('selected-files')} ({files.length})
      </Text>
      <ul className="flex flex-col gap-2">
        {files.map((file, index) => (
          <FileItem
            key={file.name}
            file={file}
            onRemove={() => onRemoveFile(index)}
            uploading={uploading}
          />
        ))}
      </ul>
    </div>
  );
};
