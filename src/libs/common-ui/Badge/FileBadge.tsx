'use client';

import { XMarkIcon } from '@heroicons/react/20/solid';
import { classMerge } from '../utils/cn';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';

interface FileBadgeProps {
  document: ThreadDocumentUI;
  onRemove: () => void;
  className?: string;
}

export const FileBadge = ({
  document,
  onRemove,
  className,
}: FileBadgeProps) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  };

  const getFileExtension = (filename: string): string => {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex !== -1 ? filename.slice(lastDotIndex) : '';
  };

  return (
    <div
      className={classMerge(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium',
        'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        'border border-blue-200 dark:border-blue-800',
        'transition-colors hover:bg-blue-200 dark:hover:bg-blue-900/50',
        className,
      )}
    >
      <span className="flex items-center gap-1">
        <span className="text-xs font-mono uppercase text-blue-600 dark:text-blue-400">
          {getFileExtension(document.name)}
        </span>
        <span className="truncate max-w-32" title={document.name}>
          {document.name}
        </span>
        <span className="text-xs text-blue-600 dark:text-blue-400">
          ({formatFileSize(document.size)})
        </span>
      </span>

      <button
        type="button"
        onClick={onRemove}
        className={classMerge(
          'ml-1 inline-flex items-center justify-center',
          'h-4 w-4 rounded-full',
          'text-blue-600 dark:text-blue-400',
          'hover:bg-blue-200 dark:hover:bg-blue-800',
          'focus:outline-none focus:ring-2 focus:ring-blue-500',
          'transition-colors',
        )}
        aria-label={`Remove ${document.name}`}
      >
        <XMarkIcon className="h-3 w-3" />
      </button>
    </div>
  );
};
