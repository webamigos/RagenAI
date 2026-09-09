'use client';

import { memo } from 'react';
import type { FileType } from '@/generated/prisma/browser';
import { CheckboxGlyph } from '@ragenai/common-ui/CheckboxGlyph';

type Props = {
  file: {
    id: string;
    fileName: string;
    fileSize: number;
    fileType: FileType;
    metadata?: Record<string, unknown> | null;
    parsingStatus?: string;
    embeddingStatus?: string;
  };
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: (fileId: string) => void;
};

export const InlineFileCard = memo(
  ({ file, selected, selectionMode, onToggleSelect }: Props) => {
    const isProcessing =
      file.embeddingStatus &&
      file.embeddingStatus !== 'COMPLETED' &&
      file.embeddingStatus !== 'FAILED';

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
            ? 'border-brand-400 bg-brand-50/30 dark:border-brand-500 dark:bg-brand-950/20'
            : 'border-border/60 hover:bg-muted/30'
        }`}
      >
        {driveUrl ? (
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-normal leading-tight line-clamp-3 mb-3 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
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
            {isProcessing && (
              <span
                role="status"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-pending-tint text-pending"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-pending" />
                <span className="sr-only">Processing</span>
              </span>
            )}
          </div>

          <button
            type="button"
            className={`${selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
            onClick={handleCheckboxClick}
            aria-label={`Select ${file.fileName}`}
          >
            <CheckboxGlyph checked={!!selected} />
          </button>
        </div>
      </div>
    );
  },
);

InlineFileCard.displayName = 'InlineFileCard';
