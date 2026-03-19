'use client';

import { memo } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { FileType } from '@/generated/prisma/browser';

type Props = {
  file: {
    publicId: string;
    fileName: string;
    fileSize: number;
    fileType: FileType;
    metadata?: Record<string, unknown> | null;
  };
  onRemove: (publicId: string) => void;
  isRemoving?: boolean;
};

export const InlineFileCard = memo(({ file, onRemove, isRemoving }: Props) => {
  const isFromDrive =
    file.metadata &&
    typeof file.metadata === 'object' &&
    'driveFileId' in file.metadata;

  return (
    <div className="relative group rounded-lg border border-border/60 p-3 flex flex-col justify-between bg-card hover:bg-muted/30 transition-colors">
      <button
        onClick={() => onRemove(file.publicId)}
        disabled={isRemoving}
        aria-label={`Remove ${file.fileName}`}
        className="absolute -top-2 -left-2 size-5 rounded-full bg-muted border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
      >
        {isRemoving ? (
          <div className="size-3 border-t-2 border-current rounded-full animate-spin" />
        ) : (
          <XMarkIcon className="size-3" />
        )}
      </button>

      <p className="text-sm font-medium leading-tight line-clamp-3 mb-3">
        {file.fileName}
      </p>

      <div className="flex items-center gap-1.5">
        {isFromDrive && (
          <img
            src="/assets/connectors/google-drive.svg"
            alt="Google Drive"
            className="size-3.5"
          />
        )}
        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border border-border/60 text-muted-foreground bg-muted/50">
          {file.fileType}
        </span>
      </div>
    </div>
  );
});

InlineFileCard.displayName = 'InlineFileCard';
