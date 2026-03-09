'use client';

import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/20/solid';
import { classMerge } from '../utils/cn';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';

interface FileBadgeProps {
  document: ThreadDocumentUI;
  onRemove: () => void;
  className?: string;
}

const getFileLabel = (filename: string): string => {
  const ext = filename.lastIndexOf('.');
  if (ext !== -1) {
    return filename.slice(ext + 1).toUpperCase();
  }
  return 'DOC';
};

export const FileBadge = ({
  document,
  onRemove,
  className,
}: FileBadgeProps) => {
  return (
    <div
      className={classMerge(
        'relative flex flex-col gap-2 w-40 rounded-xl border border-border bg-background p-3',
        'transition-colors hover:bg-muted/50',
        className,
      )}
    >
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={`Remove ${document.name}`}
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
      <span
        className="text-sm leading-snug line-clamp-3 pr-4"
        title={document.name}
      >
        {document.name}
      </span>
      <span className="inline-flex items-center gap-1 self-start rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
        <DocumentTextIcon className="size-3 text-blue-500" />
        {getFileLabel(document.name)}
      </span>
    </div>
  );
};
