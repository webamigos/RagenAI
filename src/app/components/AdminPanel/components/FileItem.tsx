import { XMarkIcon, SpinnerSVG } from '@salesyy/common-ui/icons';

interface FileItemProps {
  file: File;
  onRemove: () => void;
  uploading: boolean;
}

export const FileItem = ({ file, onRemove, uploading }: FileItemProps) => {
  return (
    <li>
      <div className="flex items-center">
        <span className="mr-2">•</span>
        <span>{file.name}</span>
        {uploading && <SpinnerSVG />}
        <button
          onClick={onRemove}
          className="ml-auto"
          aria-label={`Usuń plik ${file.name}`}
          disabled={uploading}
        >
          <XMarkIcon />
        </button>
      </div>
    </li>
  );
};
