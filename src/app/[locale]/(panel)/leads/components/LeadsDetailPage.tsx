'use client';

import { useRouter, usePathname, Link } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/tui/button';
import {
  Pagination,
  PaginationPrevious,
  PaginationNext,
  PaginationList,
  PaginationPage,
  PaginationGap,
} from '@ragenai/tui/pagination';
import { ArrowLeftIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import type { LeadListWithLeads } from '@/features/leads/contracts/lead-list.types';
import type { LeadEnrichmentJobDto } from '@/features/leads/services/queries/get-enrichment-job-query';
import { LeadsGrid } from './LeadsGrid';
import { BulkEnrichButton } from './BulkEnrichButton';
import { ScoringFileUpload } from './ScoringFileUpload';

function buildVisiblePages(current: number, total: number): (number | null)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | null)[] = [1];
  if (current > 3) {
    pages.push(null);
  }
  for (
    let p = Math.max(2, current - 1);
    p <= Math.min(total - 1, current + 1);
    p++
  ) {
    pages.push(p);
  }
  if (current < total - 2) {
    pages.push(null);
  }
  pages.push(total);
  return pages;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500];

export function LeadsDetailPage({
  list,
  activeJob,
}: {
  list: LeadListWithLeads & {
    page: number;
    totalPages: number;
    pageSize: number;
  };
  activeJob: LeadEnrichmentJobDto | null;
}) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageHref = (p: number, size?: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    if (size) {
      params.set('pageSize', String(size));
    }
    return `${pathname}?${params.toString()}`;
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = parseInt(e.target.value, 10);
    router.push(pageHref(1, size) as Parameters<typeof router.push>[0]);
  };

  const visiblePages = buildVisiblePages(list.page, list.totalPages);

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
            {t('row-count', { count: list.rowCount })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ScoringFileUpload
            leadListPublicId={list.publicId}
            currentFileName={
              list.scoringFileId ? (list.scoringFileName ?? null) : null
            }
          />
          {list.scoringCriteriaError && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              {t('scoring-criteria-parse-error')}
            </p>
          )}
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
      <div className="min-h-0 flex-1 overflow-hidden">
        <LeadsGrid
          columns={list.columns}
          leads={list.leads}
          leadListPublicId={list.publicId}
          scoringFileId={list.scoringFileId}
        />
      </div>
      <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <label
            htmlFor="page-size-select"
            className="text-sm text-zinc-500 dark:text-zinc-400"
          >
            {t('rows-per-page')}
          </label>
          <select
            id="page-size-select"
            value={list.pageSize}
            onChange={handlePageSizeChange}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        {list.totalPages > 1 && (
          <Pagination aria-label={t('pagination-label')}>
            <PaginationPrevious
              href={list.page > 1 ? pageHref(list.page - 1) : null}
            />
            <PaginationList>
              {visiblePages.map((p, i) =>
                p === null ? (
                  <PaginationGap key={`gap-${i}`} />
                ) : (
                  <PaginationPage
                    key={p}
                    href={pageHref(p)}
                    current={p === list.page}
                  >
                    {p}
                  </PaginationPage>
                ),
              )}
            </PaginationList>
            <PaginationNext
              href={
                list.page < list.totalPages ? pageHref(list.page + 1) : null
              }
            />
          </Pagination>
        )}
      </div>
    </div>
  );
}
