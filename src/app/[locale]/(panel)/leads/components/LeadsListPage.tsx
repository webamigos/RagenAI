'use client';

import { useState } from 'react';
import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/tui/button';
import { ArrowUpTrayIcon, UsersIcon } from '@heroicons/react/24/outline';
import type { LeadListSummary } from '@/features/leads/contracts/lead-list.types';
import { ImportLeadsDialog } from './ImportLeadsDialog';
import { DeleteLeadListDialog } from './DeleteLeadListDialog';

type Props = { lists: LeadListSummary[] };

export function LeadsListPage({ lists }: Props) {
  const t = useTranslations('leads-page');
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeadListSummary | null>(
    null,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-white">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t('subtitle')}
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)}>
          <ArrowUpTrayIcon className="size-4" />
          {t('create-button')}
        </Button>
      </div>

      {lists.length === 0 ? (
        <div className="mt-12 flex flex-col items-center rounded-lg border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
          <UsersIcon className="size-10 text-zinc-400" />
          <h2 className="mt-4 text-base font-semibold text-zinc-950 dark:text-white">
            {t('empty-title')}
          </h2>
          <p className="mt-1 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            {t('empty-description')}
          </p>
          <Button className="mt-6" onClick={() => setImportOpen(true)}>
            {t('create-button')}
          </Button>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {lists.map((list) => (
            <li
              key={list.publicId}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <Link
                href={`/leads/${list.publicId}`}
                className="flex min-w-0 flex-1 flex-col"
              >
                <span className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                  {list.name}
                </span>
                <span className="mt-1 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{t('row-count', { count: list.rowCount })}</span>
                  {list.enrichedCount > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {t('enriched', { count: list.enrichedCount })}
                    </span>
                  ) : null}
                  {list.pendingCount > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      {t('pending', { count: list.pendingCount })}
                    </span>
                  ) : null}
                  {list.failedCount > 0 ? (
                    <span className="text-red-600 dark:text-red-400">
                      {t('failed', { count: list.failedCount })}
                    </span>
                  ) : null}
                  {list.notFoundCount > 0 ? (
                    <span className="text-yellow-600 dark:text-yellow-400">
                      {t('not-found-count', { count: list.notFoundCount })}
                    </span>
                  ) : null}
                </span>
              </Link>
              <Button plain onClick={() => setDeleteTarget(list)}>
                {t('delete')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ImportLeadsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
      <DeleteLeadListDialog
        list={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
