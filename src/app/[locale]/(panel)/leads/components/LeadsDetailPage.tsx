'use client';

import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/tui/button';
import { ArrowLeftIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { LeadListWithLeads } from '@/features/leads/contracts/lead-list.types';
import { LeadsGrid } from './LeadsGrid';

export function LeadsDetailPage({ list }: { list: LeadListWithLeads }) {
  const t = useTranslations('leads-page');
  const router = useRouter();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Link
            href="/leads"
            className="flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeftIcon className="size-4" />
            {t('back-to-lists')}
          </Link>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <h1 className="truncate text-base font-semibold text-zinc-950 dark:text-white">
            {list.name}
          </h1>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {t('row-count', { count: list.leads.length })}
          </span>
        </div>
        <Button plain onClick={() => router.refresh()} aria-label={t('refresh')}>
          <ArrowPathIcon className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <LeadsGrid columns={list.columns} leads={list.leads} />
      </div>
    </div>
  );
}
