'use client';

import prettyBytes from 'pretty-bytes';
import { useTranslations, useFormatter } from 'next-intl';
import {
  ArrowDownTrayIcon,
  ShareIcon,
  ArrowRightIcon,
  TrashIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { EmbeddingStatus } from '@/generated/prisma/browser';
import { useRouter } from '@/i18n/routing';
import type { UserFileTypeSafe } from '../UserFiles/FileList/UserFilesTable';

type Props = {
  file: UserFileTypeSafe;
  onDownload: () => void;
  onShare: () => void;
  onMove: () => void;
  onDelete: () => void;
};

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="break-words text-sm text-foreground">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: EmbeddingStatus | undefined }) {
  const t = useTranslations('files-table');
  if (status === EmbeddingStatus.COMPLETED) {
    return (
      <span className="inline-flex rounded-full bg-ready-tint px-2 py-0.5 text-xs font-medium text-ready dark:bg-ready/30">
        {t('status-ready')}
      </span>
    );
  }
  if (status === EmbeddingStatus.FAILED) {
    return (
      <span className="inline-flex rounded-full bg-crimson-50 px-2 py-0.5 text-xs font-medium text-destructive dark:bg-crimson-950/30">
        {t('status-failed')}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-pending-tint px-2 py-0.5 text-xs font-medium text-pending dark:bg-pending/30">
      {t('status-processing')}
    </span>
  );
}

export function DocumentPreviewMetadata({
  file,
  onDownload,
  onShare,
  onMove,
  onDelete,
}: Props) {
  const t = useTranslations('document-preview');
  const format = useFormatter();
  const router = useRouter();
  const documentId = file.document?.id;

  const createdAt = file.createdAt
    ? format.dateTime(new Date(file.createdAt), { dateStyle: 'medium' })
    : '—';

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Metadane */}
      <div className="flex-1 px-4 py-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('metadata-title')}
        </p>
        <MetaRow label={t('meta-name')} value={file.fileName} />
        <MetaRow label={t('meta-size')} value={prettyBytes(file.fileSize)} />
        <MetaRow label={t('meta-type')} value={file.fileType} />
        <MetaRow label={t('meta-created')} value={createdAt} />
        <MetaRow
          label={t('meta-status')}
          value={<StatusBadge status={file.embeddingStatus} />}
        />
      </div>

      {/* Akcje */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('actions-title')}
        </p>
        <div className="flex flex-col gap-1">
          <button
            onClick={onDownload}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted dark:hover:bg-paper-700"
          >
            <ArrowDownTrayIcon className="size-4" />
            {t('action-download')}
          </button>
          <button
            onClick={onShare}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted dark:hover:bg-paper-700"
          >
            <ShareIcon className="size-4" />
            {t('action-share')}
          </button>
          <button
            onClick={onMove}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted dark:hover:bg-paper-700"
          >
            <ArrowRightIcon className="size-4" />
            {t('action-move')}
          </button>
          {documentId && (
            <button
              onClick={() =>
                router.push(
                  `/knowledge/documents/${documentId}?tab=optimize` as never,
                )
              }
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted dark:hover:bg-paper-700"
            >
              <SparklesIcon className="size-4" />
              {t('action-optimize')}
            </button>
          )}
          <button
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-crimson-50 dark:hover:bg-crimson-950/20"
          >
            <TrashIcon className="size-4" />
            {t('action-delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
