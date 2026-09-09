'use client';

import { useState, useEffect, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Download, Clock, CheckCircle2, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { exportToCsv } from '@/app/lib/utils/csv';
import { deleteFileAction } from '@/app/actions';
import type { UnusedDocument } from '@/features/documents/contracts/knowledge-analytics.types';
import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { KnowledgePieChart } from './KnowledgePieChart';
import type { PieSlice } from './KnowledgePieChart';

type Bucket = {
  key: 'range-90-180' | 'range-180-365' | 'range-365-plus';
  count: number;
};

export function computeBuckets(items: { daysSinceUsed: number }[]): Bucket[] {
  const counts = { 'range-90-180': 0, 'range-180-365': 0, 'range-365-plus': 0 };
  for (const item of items) {
    if (item.daysSinceUsed < 180) {
      counts['range-90-180']++;
    } else if (item.daysSinceUsed < 365) {
      counts['range-180-365']++;
    } else {
      counts['range-365-plus']++;
    }
  }
  return [
    { key: 'range-90-180', count: counts['range-90-180'] },
    { key: 'range-180-365', count: counts['range-180-365'] },
    { key: 'range-365-plus', count: counts['range-365-plus'] },
  ];
}

const BUCKET_COLORS: Record<string, string> = {
  'range-90-180': 'rgb(249, 115, 22)',
  'range-180-365': 'rgb(239, 68, 68)',
  'range-365-plus': 'rgb(127, 29, 29)',
};

type Props = {
  items: UnusedDocument[];
  isLoading: boolean;
};

export function UnusedDocumentsSection({ items, isLoading }: Props) {
  const t = useTranslations('settings-page.knowledge-analytics.unused-docs');
  const [localItems, setLocalItems] = useState<UnusedDocument[]>(items);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  // The whole document is held, not just its id: the confirmation names the
  // file, and the optimistic removal below needs the row back on failure.
  const [documentPendingArchive, setDocumentPendingArchive] =
    useState<UnusedDocument | null>(null);

  const handleArchive = (item: UnusedDocument) => {
    setDocumentPendingArchive(null);
    setLocalItems((prev) => prev.filter((i) => i.fileId !== item.fileId));
    startTransition(async () => {
      const result = await deleteFileAction(item.fileId);
      if (result && 'error' in result) {
        setLocalItems((prev) => {
          if (prev.some((i) => i.fileId === item.fileId)) {
            return prev;
          }
          return [...prev, item].sort(
            (a, b) => a.daysSinceUsed - b.daysSinceUsed,
          );
        });
        toast.error(t('archive-error'));
      } else {
        toast.success(t('archive-success'));
      }
    });
  };

  const handleExport = () => {
    exportToCsv(
      localItems.map((item) => ({
        [t('col-document')]: item.fileName,
        [t('col-last-cited')]: item.lastCitedAt
          ? new Date(item.lastCitedAt).toLocaleDateString()
          : '—',
        [t('col-days')]: item.daysSinceUsed,
      })),
      'unused-documents.csv',
    );
  };

  const buckets = computeBuckets(localItems);
  const pieData: PieSlice[] = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      name: t(b.key),
      value: b.count,
      color: BUCKET_COLORS[b.key],
    }));

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/40">
            <Clock className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t('title')}</h2>
            {/*
              A2: this panel is defined by a fixed threshold, not by the
              period selector, and says so rather than ignoring the selection
              silently. At seven days "not cited recently" is very nearly
              every document, and the panel would stop meaning anything.
            */}
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('fixed-window')}
            </p>
          </div>
        </div>
        {localItems.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('export')}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('export')}</span>
          </button>
        )}
      </div>

      <div
        className={`flex flex-col sm:flex-row ${isLoading || isPending ? 'opacity-60' : ''}`}
      >
        <div
          className={`w-full sm:w-64 shrink-0 flex flex-col items-center justify-center px-6 py-5 sm:border-r ${localItems.length === 0 ? 'hidden sm:flex' : ''}`}
        >
          <KnowledgePieChart
            data={pieData}
            centerLabel={String(localItems.length)}
            centerSublabel={t('chart-total-unused')}
            emptyLabel={t('chart-empty')}
            emptyIcon={<Clock className="w-5 h-5" />}
          />
        </div>

        <div className="flex-1 min-w-0">
          {localItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-50 dark:bg-green-950/30">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                {t('empty')}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t('col-document')}
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t('col-last-cited')}
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t('col-days')}
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {localItems.map((item) => {
                  let bucketColor = BUCKET_COLORS['range-365-plus'];
                  if (item.daysSinceUsed < 180) {
                    bucketColor = BUCKET_COLORS['range-90-180'];
                  } else if (item.daysSinceUsed < 365) {
                    bucketColor = BUCKET_COLORS['range-180-365'];
                  }
                  return (
                    <tr
                      key={item.fileId}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href="/knowledge/documents-list"
                          className="text-foreground hover:text-primary hover:underline transition-colors"
                        >
                          {item.fileName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {item.lastCitedAt
                          ? new Date(item.lastCitedAt).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className="inline-flex items-center justify-center min-w-[3rem] text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${bucketColor}20`,
                            color: bucketColor,
                          }}
                        >
                          {item.daysSinceUsed}d
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDocumentPendingArchive(item)}
                          disabled={isPending}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          {t('archive')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={documentPendingArchive !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDocumentPendingArchive(null);
          }
        }}
        title={t('archive-confirm-title')}
        description={
          documentPendingArchive
            ? t('archive-confirm', { name: documentPendingArchive.fileName })
            : ''
        }
        confirmLabel={t('archive')}
        destructive
        onConfirm={() => {
          if (documentPendingArchive) {
            handleArchive(documentPendingArchive);
          }
        }}
      />
    </div>
  );
}
