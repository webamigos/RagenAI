'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Download, History, CheckCircle2 } from 'lucide-react';
import { exportToCsv } from '@/app/lib/utils/csv';
import type { StaleCitedDocument } from '@/features/documents/contracts/knowledge-analytics.types';

type Props = {
  items: StaleCitedDocument[];
  isLoading: boolean;
};

/**
 * Documents answers keep citing that nobody has revised in a long time.
 *
 * The mirror image of "unused documents", and the more expensive of the two:
 * an unused document costs storage, whereas a stale one retrieval still
 * reaches lends its age to every answer drawn from it.
 *
 * There is no staleness threshold here on purpose. The screen already carries
 * one fixed threshold and a second would mean choosing an age at which a
 * document becomes wrong, which depends entirely on the document. The
 * ordering carries the signal instead — a maintained corpus just shows small
 * numbers.
 */
export function StaleCitedDocumentsSection({ items, isLoading }: Props) {
  const t = useTranslations('settings-page.knowledge-analytics.stale-cited');

  const handleExport = () => {
    exportToCsv(
      items.map((item) => ({
        [t('col-document')]: item.fileName,
        [t('col-citations')]: item.citationCount,
        [t('col-updated')]: new Date(item.lastUpdatedAt).toLocaleDateString(),
        [t('col-days')]: item.daysSinceUpdated,
      })),
      'stale-cited-documents.csv',
    );
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40">
            <History className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t('title')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('description')}
            </p>
          </div>
        </div>
        {items.length > 0 && (
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

      <div className={isLoading ? 'opacity-60' : ''}>
        {items.length === 0 ? (
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
                <th className="text-left px-3 py-3 sm:px-5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('col-document')}
                </th>
                <th className="text-right px-3 py-3 sm:px-5 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  {t('col-citations')}
                </th>
                <th className="text-left px-3 py-3 sm:px-5 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  {t('col-updated')}
                </th>
                <th className="text-right px-3 py-3 sm:px-5 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  {t('col-days')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.fileId}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-3 py-3 sm:px-5 max-w-0">
                    <Link
                      href="/knowledge/documents-list"
                      className="block truncate text-foreground hover:text-primary hover:underline transition-colors"
                    >
                      {item.fileName}
                    </Link>
                  </td>
                  <td className="px-3 py-3 sm:px-5 text-right font-medium tabular-nums whitespace-nowrap">
                    {item.citationCount}
                  </td>
                  <td className="px-3 py-3 sm:px-5 text-muted-foreground whitespace-nowrap">
                    {new Date(item.lastUpdatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3 sm:px-5 text-right tabular-nums whitespace-nowrap">
                    {t('days', { count: item.daysSinceUpdated })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
