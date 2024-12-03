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
  return (
    <div className="mt-4">
      <Text fontSize="lg" fontWeight="medium">
        Wybrane pliki:
      </Text>
      <ul>
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
