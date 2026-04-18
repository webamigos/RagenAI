'use client';

import { useTranslations } from 'next-intl';
import { X, Trash2, FolderInput, Share2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  onMove: () => void;
  onShare: () => void;
  onReembed: () => void;
  isLoading?: boolean;
};

export const BulkActionBar = ({
  selectedCount,
  onClear,
  onDelete,
  onMove,
  onShare,
  onReembed,
  isLoading,
}: Props) => {
  const t = useTranslations('bulk-action-bar');

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      role="toolbar"
      aria-label={t('aria-label')}
      data-testid="bulk-action-bar"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-background px-4 py-3 shadow-lg"
    >
      <button
        onClick={onClear}
        disabled={isLoading}
        aria-label={t('clear')}
        data-testid="bulk-clear"
        className="mr-1 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <X className="size-4" />
      </button>

      <span
        className="mr-2 min-w-[4ch] text-sm font-medium"
        data-testid="bulk-selected-count"
      >
        {t('selected', { count: selectedCount })}
      </span>

      <Button
        variant="destructive"
        size="sm"
        onClick={onDelete}
        disabled={isLoading}
        data-testid="bulk-delete"
        className="gap-1.5"
      >
        <Trash2 className="size-3.5" />
        {t('delete')}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onMove}
        disabled={isLoading}
        data-testid="bulk-move"
        className="gap-1.5"
      >
        <FolderInput className="size-3.5" />
        {t('move')}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onShare}
        disabled={isLoading}
        data-testid="bulk-share"
        className="gap-1.5"
      >
        <Share2 className="size-3.5" />
        {t('share')}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onReembed}
        disabled={isLoading}
        data-testid="bulk-reembed"
        className="gap-1.5"
      >
        <RefreshCw className="size-3.5" />
        {t('reembed')}
      </Button>
    </div>
  );
};
