'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { exportToCsv } from '@/app/lib/utils/csv';
import type { TopCitedDocument } from '@/features/documents/contracts/knowledge-analytics.types';

type Props = {
  items: TopCitedDocument[];
  isLoading: boolean;
};

export function TopCitedDocumentsTable({ items, isLoading }: Props) {
  const t = useTranslations('settings-page.knowledge-analytics.top-cited');

  const handleExport = () => {
    exportToCsv(
      items.map((item) => ({
        [t('col-document')]: item.fileName,
        [t('col-citations')]: item.citationCount,
      })),
      'top-cited-documents.csv',
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
                <th className="text-right px-4 py-2 font-medium">
                  {t('col-citations')}
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
                  <td className="px-4 py-2 text-right">{item.citationCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
