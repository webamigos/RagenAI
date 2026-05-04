'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Download, ThumbsDown, CheckCircle2 } from 'lucide-react';
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
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40">
            <ThumbsDown className="w-4 h-4 text-red-500" />
          </div>
          <h2 className="text-base font-semibold">{t('title')}</h2>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {t('export')}
          </button>
        )}
      </div>

      {items.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-50 dark:bg-green-950/30">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-sm text-muted-foreground max-w-xs">{t('empty')}</p>
        </div>
      ) : (
        <div className={isLoading ? 'opacity-60' : ''}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('col-thread')}
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('col-date')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.messageId}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/chats/${item.threadId}` as '/chats/[threadId]'}
                      className="text-foreground hover:text-primary hover:underline transition-colors"
                    >
                      {item.threadTitle ?? item.threadId}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
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
