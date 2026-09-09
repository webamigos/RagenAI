import prettyBytes from 'pretty-bytes';

import { XMarkIcon } from '@ragenai/common-ui/icons';
import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { getFileType } from '@/app/lib/utils/getFileType';

type Props = {
  file: File;
  onRemove: () => void;
  uploading: boolean;
};

export const FileItem = ({ file, onRemove, uploading }: Props) => {
  const fileType = getFileType(file.name);
  const fileIcon = getFileIcon(fileType);

  return (
    <li className="flex items-center gap-3 rounded-md border border-border px-3 py-2 dark:border-border">
      <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
        {fileIcon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {file.name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {prettyBytes(file.size)}
      </span>
      {!uploading && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-crimson-50 hover:text-destructive dark:text-muted-foreground dark:hover:bg-crimson-950/40 dark:hover:text-destructive"
          aria-label={`remove file ${file.name}`}
        >
          <XMarkIcon className="size-4" />
        </button>
      )}
    </li>
  );
};
