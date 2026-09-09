'use client';

import { useTranslations } from 'next-intl';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { getFileIcon } from '@/app/lib/constants/fileIcons';
import type { FileType } from '@/generated/prisma/browser';

type Props = {
  fileName: string;
  fileType: FileType;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
};

export function DocumentPreviewHeader({
  fileName,
  fileType,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onClose,
}: Props) {
  const t = useTranslations('document-preview');
  const icon = getFileIcon(fileType);

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
      <span className="inline-flex size-6 shrink-0 items-center">{icon}</span>
      <span
        className="flex-1 truncate text-sm font-medium text-foreground"
        title={fileName}
      >
        {fileName}
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={!canGoPrev}
          aria-label={t('prev-document')}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40 dark:hover:bg-paper-700"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <button
          onClick={onNext}
          disabled={!canGoNext}
          aria-label={t('next-document')}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40 dark:hover:bg-paper-700"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <button
        onClick={onClose}
        aria-label={t('close')}
        className="rounded p-1.5 text-muted-foreground hover:bg-muted dark:hover:bg-paper-700"
      >
        <XMarkIcon className="size-5" />
      </button>
    </div>
  );
}
