'use client';

import { useCallback, useState } from 'react';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/tui/button';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { LeadListWithLeads } from '@/features/leads/contracts/lead-list.types';
import type { LeadEnrichmentJobDto } from '@/features/leads/services/queries/get-enrichment-job-query';
import { LeadsGrid } from './LeadsGrid';
import { LeadsToolbar } from './LeadsToolbar';
import { LeadsBulkBar } from './LeadsBulkBar';
import { LeadsAssistantDrawer } from './LeadsAssistantDrawer';
import { BulkEnrichButton } from './BulkEnrichButton';
import { ScoringFileUpload } from './ScoringFileUpload';

const DEFAULT_PAGE_SIZE = 100;

export function LeadsDetailPage({
  list,
  activeJob,
}: {
  list: LeadListWithLeads;
  activeJob: LeadEnrichmentJobDto | null;
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
            {t('row-count', { count: list.rowCount })}
          </span>
          {list.scoringCriteriaError && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t('scoring-criteria-parse-error')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ScoringFileUpload
            leadListPublicId={list.publicId}
            currentFileName={
              list.scoringFileId ? (list.scoringFileName ?? null) : null
            }
          />
          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50"
          >
            <SparklesIcon className="size-4" />
            {t('assistant-open')}
          </button>
          <BulkEnrichButton
            leadListPublicId={list.publicId}
            initialJob={activeJob}
          />
          <Button
            plain
            onClick={() => router.refresh()}
            aria-label={t('refresh')}
          >
            <ArrowPathIcon className="size-4" />
          </Button>
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
