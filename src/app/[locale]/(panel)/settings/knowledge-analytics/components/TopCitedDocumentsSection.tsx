'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
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

      {items.length === 0 && !isLoading ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div
          className={`flex flex-col sm:flex-row gap-6 ${isLoading ? 'opacity-60' : ''}`}
        >
          <div className="w-full sm:w-[280px] shrink-0">
            <KnowledgePieChart
              data={pieData}
              centerLabel={String(totalCitations)}
              emptyLabel={t('chart-empty')}
            />
            {items.length > 0 && (
              <p className="text-center text-xs text-muted-foreground mt-1">
                {t('chart-total-citations')}
              </p>
            )}
          </div>

          <div className="flex-1 rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">
                    {t('col-document')}
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    {t('col-citations')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={item.fileId}
                    className={`border-t cursor-pointer transition-colors ${
                      selectedIndex === index
                        ? 'bg-primary/10'
                        : 'hover:bg-muted/30'
                    }`}
                    onClick={() =>
                      setSelectedIndex(selectedIndex === index ? null : index)
                    }
                  >
                    <td className="px-4 py-2">
                      <Link
                        href="/knowledge/documents-list"
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.fileName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {item.citationCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
