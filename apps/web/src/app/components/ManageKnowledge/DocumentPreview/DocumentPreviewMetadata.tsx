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
    <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2 last:border-b-0 dark:border-gray-700">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="break-words text-sm text-gray-900 dark:text-gray-100">
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: EmbeddingStatus | undefined }) {
  const t = useTranslations('files-table');
  if (status === EmbeddingStatus.COMPLETED) {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        {t('status-ready')}
      </span>
    );
  }
  if (status === EmbeddingStatus.FAILED) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        {t('status-failed')}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
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
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
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
      <div className="shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t('actions-title')}
        </p>
        <div className="flex flex-col gap-1">
          <button
            onClick={onDownload}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowDownTrayIcon className="size-4" />
            {t('action-download')}
          </button>
          <button
            onClick={onShare}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ShareIcon className="size-4" />
            {t('action-share')}
          </button>
          <button
            onClick={onMove}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
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
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <SparklesIcon className="size-4" />
              {t('action-optimize')}
            </button>
          )}
          <button
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <TrashIcon className="size-4" />
            {t('action-delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
