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
  };
  onRemove: (publicId: string) => void;
  isRemoving?: boolean;
};

export const InlineFileCard = memo(({ file, onRemove, isRemoving }: Props) => {
  return (
    <div className="relative group rounded-lg border border-border/60 p-3 min-w-[160px] max-w-[200px] flex flex-col justify-between bg-card hover:bg-muted/30 transition-colors">
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

      <span className="inline-flex items-center self-start px-1.5 py-0.5 text-[10px] font-medium rounded border border-border/60 text-muted-foreground bg-muted/50">
        {file.fileType}
      </span>
    </div>
  );
});

InlineFileCard.displayName = 'InlineFileCard';
