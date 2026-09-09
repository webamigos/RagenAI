'use client';

import prettyBytes from 'pretty-bytes';
import { StatusBadge } from '@/components/ui/status-badge';
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

/**
 * Was a second component of the same name, painting the same four states in a
 * fourth spelling — and, like the file table's, it had no `queued`: a file
 * waiting for a worker said "Processing". The shared badge has one.
 */
function FileStatus({ status }: { status: EmbeddingStatus | undefined }) {
  const t = useTranslations('files-table');

  if (status === EmbeddingStatus.COMPLETED) {
    return <StatusBadge state="ready" label={t('status-ready')} />;
  }
  if (status === EmbeddingStatus.FAILED) {
    return <StatusBadge state="failed" label={t('status-failed')} />;
  }
  if (status === EmbeddingStatus.STARTED) {
    return <StatusBadge state="processing" label={t('status-processing')} />;
  }
  return <StatusBadge state="queued" label={t('status-queued')} />;
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
          value={<FileStatus status={file.embeddingStatus} />}
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
