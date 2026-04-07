'use client';

import { memo } from 'react';
import type { FileType } from '@/generated/prisma/browser';
import { Checkbox } from '@ragenai/tui';

type Props = {
  file: {
    id: string;
    fileName: string;
    fileSize: number;
    fileType: FileType;
    metadata?: Record<string, unknown> | null;
  };
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: (fileId: string) => void;
};

export const InlineFileCard = memo(
  ({ file, selected, selectionMode, onToggleSelect }: Props) => {
    const isFromDrive =
      file.metadata &&
      typeof file.metadata === 'object' &&
      'driveFileId' in file.metadata;

    const driveFileId = isFromDrive
      ? (file.metadata as Record<string, unknown>).driveFileId
      : null;

    const driveUrl = driveFileId
      ? `https://drive.google.com/file/d/${driveFileId}/view`
      : null;

    const handleCheckboxClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleSelect?.(file.id);
    };

    return (
      <div
        className={`relative group rounded-lg border p-3 flex flex-col justify-between bg-card transition-colors ${
          selected
            ? 'border-indigo-400 bg-indigo-50/30 dark:border-indigo-500 dark:bg-indigo-950/20'
            : 'border-border/60 hover:bg-muted/30'
        }`}
      >
        {driveUrl ? (
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-normal leading-tight line-clamp-3 mb-3 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            {file.fileName}
          </a>
        ) : (
          <p className="text-sm font-normal leading-tight line-clamp-3 mb-3">
            {file.fileName}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isFromDrive && (
              <img
                src="/assets/connectors/google-drive.svg"
                alt="Google Drive"
                className="size-3.5"
              />
            )}
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border border-border/60 text-muted-foreground bg-muted/50">
              {isFromDrive ? 'DOC' : file.fileType}
            </span>
          </div>

          <button
            type="button"
            className={`${selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
            onClick={handleCheckboxClick}
            aria-label={`Select ${file.fileName}`}
          >
            <Checkbox checked={!!selected} />
          </button>
        </div>
      </div>
    );
  },
);

InlineFileCard.displayName = 'InlineFileCard';
