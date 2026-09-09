'use client';

import { useState, useEffect, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  Download,
  ThumbsDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { exportToCsv } from '@/app/lib/utils/csv';
import { getNegativeQaPage } from '@/app/actions/knowledge-analytics';
import type {
  NegativeQaItem,
  NegativeQaResult,
} from '@/features/documents/contracts/knowledge-analytics.types';

const PAGE_SIZE = 10;

type Props = {
  initialData: NegativeQaResult;
  days?: number;
  isLoading: boolean;
};

export function NegativeQaTable({ initialData, days = 30, isLoading }: Props) {
  const t = useTranslations('settings-page.knowledge-analytics.negative-qa');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NegativeQaItem[]>(initialData.items);
  const [total, setTotal] = useState(initialData.total);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialData.items);
    setTotal(initialData.total);
    setPage(1);
  }, [initialData]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const goToPage = (next: number) => {
    startTransition(async () => {
      const result = await getNegativeQaPage(days, next);
      setItems(result.items);
      setTotal(result.total);
      setPage(next);
    });
  };

  const handleExport = () => {
    exportToCsv(
      items.map((item) => ({
        [t('col-thread')]: item.threadTitle ?? item.threadId,
        [t('col-date')]: new Date(item.createdAt).toLocaleDateString(),
      })),
      'negative-qa.csv',
    );
  };

  const isEmpty = total === 0 && !isLoading;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-crimson-50 dark:bg-crimson-950/40">
            <ThumbsDown className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t('title')}</h2>
            {total > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('total-count', { count: total })}
              </p>
            )}
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

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-ready-tint dark:bg-ready/30">
            <CheckCircle2 className="w-5 h-5 text-ready" />
          </div>
          <p className="text-sm text-muted-foreground max-w-xs">{t('empty')}</p>
        </div>
      ) : (
        <div className={isLoading || isPending ? 'opacity-60' : ''}>
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                {t('page-info', { page, totalPages })}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1 || isPending}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages || isPending}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
