import { XMarkIcon, SpinnerSVG } from '@ragenai/common-ui/icons';

type Props = {
  file: File;
  onRemove: () => void;
  uploading: boolean;
};

export const FileItem = ({ file, onRemove, uploading }: Props) => {
  return (
    <li>
      <div className="flex items-center">
        <span className="mr-2">•</span>
        <span>{file.name}</span>
        {uploading ? (
          <SpinnerSVG className="ml-auto" size="sm" />
        ) : (
          <button
            onClick={onRemove}
            className="ml-auto"
            aria-label={`remove file ${file.name}`}
            disabled={uploading}
          >
            <XMarkIcon />
          </button>
        )}
      </div>
    </li>
  );
};
