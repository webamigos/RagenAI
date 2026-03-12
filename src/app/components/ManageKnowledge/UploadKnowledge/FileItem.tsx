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
    <li className="flex items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-700">
      <span className="flex size-6 shrink-0 items-center justify-center text-zinc-500 dark:text-zinc-400">
        {fileIcon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">
        {file.name}
      </span>
      <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
        {prettyBytes(file.size)}
      </span>
      {!uploading && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-zinc-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          aria-label={`remove file ${file.name}`}
        >
          <XMarkIcon className="size-4" />
        </button>
      )}
    </li>
  );
};
