'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { exportToCsv } from '@/app/lib/utils/csv';
import type { NegativeQaItem } from '@/features/documents/contracts/knowledge-analytics.types';

type Props = {
  items: NegativeQaItem[];
  isLoading: boolean;
};

export function NegativeQaTable({ items, isLoading }: Props) {
  const t = useTranslations('settings-page.knowledge-analytics.negative-qa');

  const handleExport = () => {
    exportToCsv(
      items.map((item) => ({
        [t('col-thread')]: item.threadTitle ?? item.threadId,
        [t('col-date')]: new Date(item.createdAt).toLocaleDateString(),
      })),
      'negative-qa.csv',
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
                  {t('col-thread')}
                </th>
                <th className="text-left px-4 py-2 font-medium">
                  {t('col-date')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.messageId} className="border-t">
                  <td className="px-4 py-2">
                    <Link
                      href={`/chats/${item.threadId}` as '/chats/[threadId]'}
                      className="text-primary hover:underline"
                    >
                      {item.threadTitle ?? item.threadId}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
