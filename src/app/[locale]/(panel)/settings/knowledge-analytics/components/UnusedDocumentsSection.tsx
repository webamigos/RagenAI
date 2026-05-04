'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { exportToCsv } from '@/app/lib/utils/csv';
import type { UnusedDocument } from '@/features/documents/contracts/knowledge-analytics.types';
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

  const handleExport = () => {
    exportToCsv(
      items.map((item) => ({
        [t('col-document')]: item.fileName,
        [t('col-last-cited')]: item.lastCitedAt
          ? new Date(item.lastCitedAt).toLocaleDateString()
          : '—',
        [t('col-days')]: item.daysSinceUsed,
      })),
      'unused-documents.csv',
    );
  };

  const buckets = computeBuckets(items);
  const pieData: PieSlice[] = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      name: t(b.key),
      value: b.count,
      color: BUCKET_COLORS[b.key],
    }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            className="text-sm text-primary hover:underline"
          >
            {t('export')}
          </button>
        )}
      </div>

      <div
        className={`flex flex-col sm:flex-row gap-6 ${isLoading ? 'opacity-60' : ''}`}
      >
        <div className="w-full sm:w-[280px] shrink-0">
          <KnowledgePieChart
            data={pieData}
            centerLabel={String(items.length)}
            emptyLabel={t('chart-empty')}
          />
          <p className="text-center text-xs text-muted-foreground mt-1">
            {t('chart-total-unused')}
          </p>
        </div>

        <div className="flex-1 rounded-lg border overflow-hidden">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{t('empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">
                    {t('col-document')}
                  </th>
                  <th className="text-left px-4 py-2 font-medium">
                    {t('col-last-cited')}
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    {t('col-days')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.fileId} className="border-t">
                    <td className="px-4 py-2">
                      <Link
                        href="/knowledge/documents-list"
                        className="text-primary hover:underline"
                      >
                        {item.fileName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {item.lastCitedAt
                        ? new Date(item.lastCitedAt).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {item.daysSinceUsed}
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
