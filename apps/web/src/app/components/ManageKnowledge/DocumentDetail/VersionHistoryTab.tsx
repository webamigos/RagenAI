'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { useRouter } from '@/i18n/routing';
import { statusToast } from '@/app/lib/utils/toast';
import type { DocumentVersionSummary } from '@/features/documents/contracts/document-version.types';
import { ScoreBadge } from './ScoreBadge';

type Props = { documentId: string };

/** Keyed by the ChangeType enum; labels come from the message catalogue. */
const CHANGE_TYPE_COLORS: Record<string, string> = {
  UPLOAD: 'bg-muted text-muted-foreground dark:bg-paper-700',
  MANUAL: 'bg-accent text-primary dark:bg-primary/40',
  AI_REWRITE:
    'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300',
  AI_OPTIMIZE:
    'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300',
  ROLLBACK: 'bg-pending-tint text-pending dark:bg-pending/40',
};

export function VersionHistoryTab({ documentId }: Props) {
  const t = useTranslations('document-versions');
  const locale = useLocale();
  const { errorToast, successToast } = statusToast();
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const router = useRouter();

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`);
      if (!res.ok) {
        errorToast({ message: t('load-failed') });
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data?.versions)) {
        // Everything below assumes an array; a malformed body would otherwise
        // throw during render rather than showing the error state.
        errorToast({ message: t('load-failed') });
        return;
      }
      setVersions(data.versions);
    } catch {
      errorToast({ message: t('load-failed') });
    } finally {
      setLoading(false);
    }
    // errorToast/t are recreated per render by their hooks; depending on them
    // would refetch the list on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // Both the id and the number: the request needs the id, the confirmation
  // names the number.
  const [versionPendingRollback, setVersionPendingRollback] = useState<{
    id: string;
    number: number;
  } | null>(null);

  const handleRollback = async (versionId: string, versionNumber: number) => {
    setVersionPendingRollback(null);

    setRollingBack(versionId);
    try {
      const res = await fetch(
        `/api/documents/${documentId}/versions/${versionId}/rollback`,
        { method: 'POST' },
      );
      if (!res.ok) {
        // Silence here was the old behaviour: the spinner stopped and the list
        // looked unchanged, which reads as "nothing happened" rather than
        // "this failed".
        errorToast({ message: t('rollback-failed') });
        return;
      }
      successToast({ message: t('rollback-succeeded') });
      await fetchVersions();
      // The Content tab and the document header are server-rendered from
      // UserDocument, which the rollback just rewrote.
      router.refresh();
    } catch {
      errorToast({ message: t('rollback-failed') });
    } finally {
      setRollingBack(null);
    }
  };

  const handleDiff = (v1Id: string, v2Id: string) => {
    router.push(
      `/knowledge/documents/${documentId}/diff?v1=${v1Id}&v2=${v2Id}` as Parameters<
        typeof router.push
      >[0],
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-zinc-600 dark:border-t-zinc-300" />
        <span className="ml-3 text-sm">{t('loading')}</span>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
        <svg
          className="mb-3 h-8 w-8 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <p className="text-sm font-medium text-muted-foreground">
          {t('empty-title')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t('empty-hint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {versions.map((version, idx) => (
        <div
          key={version.id}
          data-testid={`document-version-${version.versionNumber}`}
          className={`flex items-center justify-between rounded-lg border p-4 shadow-sm transition-colors ${
            version.isActive
              ? 'border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/20'
              : 'border-border bg-white dark:bg-muted'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground dark:text-white">
                v{version.versionNumber}
              </span>
              {version.isActive && (
                <span className="rounded px-1.5 py-0.5 text-xs font-medium text-brand-600 outline outline-1 outline-brand-600 dark:text-brand-400 dark:outline-brand-400">
                  {t('active')}
                </span>
              )}
            </div>

            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                CHANGE_TYPE_COLORS[version.changeType] ??
                CHANGE_TYPE_COLORS.UPLOAD
              }`}
            >
              {t(`change-type.${version.changeType}` as never)}
            </span>

            <span className="text-xs text-muted-foreground">
              {version.authorName ?? t('author-system')}&nbsp;&middot;&nbsp;
              {new Date(version.createdAt).toLocaleString(locale)}
            </span>

            {version.ragScore ? (
              <ScoreBadge total={version.ragScore.total} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {t('no-score')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {idx < versions.length - 1 && (
              <button
                onClick={() => handleDiff(versions[idx + 1].id, version.id)}
                className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted dark:hover:bg-paper-700"
              >
                {t('compare')}
              </button>
            )}
            {!version.isActive && (
              <button
                onClick={() =>
                  setVersionPendingRollback({
                    id: version.id,
                    number: version.versionNumber,
                  })
                }
                disabled={rollingBack === version.id}
                className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-paper-200 disabled:text-muted-foreground dark:disabled:bg-paper-700"
              >
                {rollingBack === version.id
                  ? t('rollback-in-progress')
                  : t('rollback')}
              </button>
            )}
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={versionPendingRollback !== null}
        onOpenChange={(open) => {
          if (!open) {
            setVersionPendingRollback(null);
          }
        }}
        title={t('rollback-confirm-title')}
        description={
          versionPendingRollback
            ? t('rollback-confirm', { version: versionPendingRollback.number })
            : ''
        }
        confirmLabel={t('rollback')}
        destructive
        onConfirm={() => {
          if (versionPendingRollback) {
            void handleRollback(
              versionPendingRollback.id,
              versionPendingRollback.number,
            );
          }
        }}
      />
    </div>
  );
}
