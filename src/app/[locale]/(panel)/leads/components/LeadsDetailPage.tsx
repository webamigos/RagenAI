'use client';

import { useCallback, useState } from 'react';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { ArrowLeftIcon, SparklesIcon } from '@heroicons/react/24/outline';
import type { LeadListWithLeads } from '@/features/leads/contracts/lead-list.types';
import type { LeadEnrichmentJobDto } from '@/features/leads/services/queries/get-enrichment-job-query';
import { LeadsGrid } from './LeadsGrid';
import { LeadsToolbar } from './LeadsToolbar';
import { LeadsBulkBar } from './LeadsBulkBar';
import { LeadsAssistantDrawer } from './LeadsAssistantDrawer';
import { BulkEnrichButton } from './BulkEnrichButton';
import { ScoringFileUpload } from './ScoringFileUpload';
import { CreditsChip } from './CreditsChip';

const DEFAULT_PAGE_SIZE = 100;

export function LeadsDetailPage({
  list,
  activeJob,
  creditsBalance,
}: {
  list: LeadListWithLeads;
  activeJob: LeadEnrichmentJobDto | null;
  creditsBalance: number | null;
}) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  return (
    <div
      data-panel-fullwidth
      className="flex h-[calc(100vh-8rem)] flex-col lg:h-[calc(100vh-6rem)]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/leads"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            aria-label={t('back-to-lists')}
            title={t('back-to-lists')}
          >
            <ArrowLeftIcon className="size-4" />
            <span className="hidden sm:inline">{t('back-to-lists')}</span>
          </Link>
          <span className="shrink-0 text-zinc-300 dark:text-zinc-700">/</span>
          <h1 className="min-w-0 truncate text-base font-semibold text-zinc-950 dark:text-white">
            {list.name}
          </h1>
          <span className="hidden shrink-0 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400 md:inline">
            {t('row-count', { count: list.rowCount })}
          </span>
          {list.scoringCriteriaError && (
            <span
              className="hidden shrink-0 truncate text-xs text-amber-600 dark:text-amber-400 lg:inline"
              title={t('scoring-criteria-parse-error')}
            >
              {t('scoring-criteria-parse-error')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {creditsBalance !== null && <CreditsChip balance={creditsBalance} />}
          <ScoringFileUpload
            leadListPublicId={list.publicId}
            currentFileName={
              list.scoringFileId ? (list.scoringFileName ?? null) : null
            }
          />
          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            title={t('assistant-open')}
            aria-label={t('assistant-open')}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50"
          >
            <SparklesIcon className="size-3.5" />
            <span className="hidden md:inline">{t('assistant-open')}</span>
          </button>
          <BulkEnrichButton
            leadListPublicId={list.publicId}
            initialJob={activeJob}
          />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <LeadsGrid
          columns={list.columns}
          leads={list.leads}
          leadListPublicId={list.publicId}
          scoringFileId={list.scoringFileId}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          onSelectionChange={handleSelectionChange}
          renderToolbar={(table) => (
            <LeadsToolbar
              table={table}
              columns={list.columns}
              leads={list.leads}
              listName={list.name}
              onRefresh={() => router.refresh()}
            />
          )}
          renderBulkBar={({ selectedIds: ids, clearSelection }) => (
            <LeadsBulkBar
              leadListPublicId={list.publicId}
              selectedIds={ids}
              clearSelection={clearSelection}
            />
          )}
        />
      </div>
      <LeadsAssistantDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        leadListPublicId={list.publicId}
        listName={list.name}
        totalRows={list.rowCount}
        selectedIds={selectedIds}
      />
    </div>
  );
}
