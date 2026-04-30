'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { exportToCsv } from '@/app/lib/utils/csv';
import type { UnusedDocument } from '@/features/documents/contracts/knowledge-analytics.types';

type Props = {
  items: UnusedDocument[];
  isLoading: boolean;
};

export function UnusedDocumentsTable({ items, isLoading }: Props) {
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
          className={`rounded-lg border overflow-hidden ${isLoading ? 'opacity-60' : ''}`}
        >
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
                  <td className="px-4 py-2 text-right">{item.daysSinceUsed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
