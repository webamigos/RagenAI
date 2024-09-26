// components/FileList.tsx
import { FileItem } from './FileItem';

interface FileListProps {
  files: File[];
  onRemoveFile: (index: number) => void;
  uploading: boolean;
}

export const FileList = ({ files, onRemoveFile, uploading }: FileListProps) => {
  return (
    <div>
      <h3>Wybrane pliki:</h3>
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
