'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  Download,
  FileText,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { exportToCsv } from '@/app/lib/utils/csv';
import type { TopCitedDocument } from '@/features/documents/contracts/knowledge-analytics.types';
import { KnowledgePieChart } from './KnowledgePieChart';
import type { PieSlice } from './KnowledgePieChart';

const PIE_COLORS = [
  'rgb(59, 130, 246)',
  'rgb(234, 179, 8)',
  'rgb(34, 197, 94)',
  'rgb(168, 85, 247)',
  'rgb(236, 72, 153)',
  'rgb(20, 184, 166)',
  'rgb(249, 115, 22)',
  'rgb(148, 163, 184)',
];

type Props = {
  items: TopCitedDocument[];
  isLoading: boolean;
};

export function TopCitedDocumentsSection({ items, isLoading }: Props) {
  const t = useTranslations('settings-page.knowledge-analytics.top-cited');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleExport = () => {
    exportToCsv(
      items.map((item) => ({
        [t('col-document')]: item.fileName,
        [t('col-citations')]: item.citationCount,
        [t('col-rating')]:
          item.positiveRatePct === null
            ? '—'
            : `${item.positiveRatePct}% (+${item.positiveCount}/-${item.negativeCount})`,
      })),
      'top-cited-documents.csv',
    );
  };

  const totalCitations = items.reduce(
    (sum, item) => sum + item.citationCount,
    0,
  );

  const pieData: PieSlice[] = items.map((item, i) => ({
    name: item.fileName,
    value: item.citationCount,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent dark:bg-primary/40">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold">{t('title')}</h2>
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

      <div
        className={`flex flex-col sm:flex-row ${isLoading ? 'opacity-60' : ''}`}
      >
        <div
          className={`w-full sm:w-64 shrink-0 flex flex-col items-center justify-center px-6 py-5 sm:border-r ${items.length === 0 ? 'hidden sm:flex' : ''}`}
        >
          <KnowledgePieChart
            data={pieData}
            centerLabel={String(totalCitations)}
            centerSublabel={t('chart-total-citations')}
            emptyLabel={t('chart-empty')}
            emptyIcon={<TrendingUp className="w-5 h-5" />}
          />
        </div>

        <div className="flex-1 min-w-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                <FileText className="w-5 h-5 text-muted-foreground" />
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
                  <th className="text-right px-3 py-3 sm:px-5 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    {t('col-rating')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={item.fileId}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selectedIndex === index}
                    className={`border-b last:border-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                      selectedIndex === index
                        ? 'bg-accent/60 dark:bg-primary/20'
                        : 'hover:bg-muted/30'
                    }`}
                    onClick={() =>
                      setSelectedIndex(selectedIndex === index ? null : index)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedIndex(
                          selectedIndex === index ? null : index,
                        );
                      }
                    }}
                  >
                    <td className="px-3 py-3 sm:px-5 max-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              PIE_COLORS[index % PIE_COLORS.length],
                          }}
                        />
                        <Link
                          href="/knowledge/documents-list"
                          className="text-foreground hover:text-primary hover:underline truncate transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.fileName}
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-5 text-right font-medium tabular-nums whitespace-nowrap">
                      {item.citationCount}
                    </td>
                    <td className="px-3 py-3 sm:px-5 text-right whitespace-nowrap">
                      {item.positiveRatePct === null ? (
                        // A dash, not 0%. Nobody rated the answers citing
                        // this document, which is a different finding from
                        // everybody disliking them.
                        //
                        // The accessible name is an `aria-label`, not a
                        // `title`: a title attribute is a hover tooltip that
                        // most screen readers do not announce, so on its own
                        // the cell reads as an em dash and nothing else.
                        <span
                          className="text-muted-foreground"
                          aria-label={t('rating-none')}
                        >
                          —
                        </span>
                      ) : (
                        // The icons are decorative and hidden; without a label
                        // on each count the cell announces "3 1", which is two
                        // numbers and no meaning.
                        <span className="inline-flex items-center gap-2 text-xs tabular-nums">
                          <span
                            className="inline-flex items-center gap-1 text-ready"
                            aria-label={t('rating-positive', {
                              count: item.positiveCount,
                            })}
                          >
                            <ThumbsUp className="w-3 h-3" aria-hidden="true" />
                            {item.positiveCount}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 text-destructive"
                            aria-label={t('rating-negative', {
                              count: item.negativeCount,
                            })}
                          >
                            <ThumbsDown
                              className="w-3 h-3"
                              aria-hidden="true"
                            />
                            {item.negativeCount}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
