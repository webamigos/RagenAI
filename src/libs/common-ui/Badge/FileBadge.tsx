'use client';

import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/20/solid';
import { classMerge } from '../utils/cn';
import { getFileLabel } from '../utils/file-helpers';
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
  const isImage = !!document.imageData;

  return (
    <div
      className={classMerge(
        'relative flex flex-col w-40 rounded-xl border border-border bg-background overflow-hidden',
        'transition-colors hover:bg-muted/50',
        document.sourceUrl && 'cursor-pointer',
        className,
      )}
      onClick={
        document.sourceUrl
          ? () =>
              window.open(document.sourceUrl, '_blank', 'noopener,noreferrer')
          : undefined
      }
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-1.5 right-1.5 z-10 inline-flex items-center justify-center h-5 w-5 rounded-full bg-background/80 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={`Remove ${document.name}`}
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
      {isImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={document.imageData}
            alt={document.name}
            className="h-20 w-full object-cover"
          />
          <div className="px-2 py-1.5">
            <span
              className="block text-xs leading-snug line-clamp-1"
              title={document.name}
            >
              {document.name}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 p-3">
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
      )}
    </div>
  );
};
