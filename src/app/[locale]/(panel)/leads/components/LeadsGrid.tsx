'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowPathIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { LeadEnrichmentStatus } from '@/generated/prisma/enums';
import { enrichLead } from '@/app/actions/leads';
import type { LeadColumn } from '@/features/leads/contracts/lead-column.types';
import type { LeadDto } from '@/features/leads/contracts/lead-list.types';
import { clsx } from 'clsx';
import { ManualNipModal } from './ManualNipModal';

type Props = {
  columns: LeadColumn[];
  leads: LeadDto[];
};

const ROW_NUMBER_WIDTH = 56;
const ACTION_COL_WIDTH = 110;
const DEFAULT_COL_WIDTH = 180;

const STATUS_LABEL_KEYS = {
  [LeadEnrichmentStatus.idle]: 'status-idle',
  [LeadEnrichmentStatus.pending]: 'status-pending',
  [LeadEnrichmentStatus.enriched]: 'status-enriched',
  [LeadEnrichmentStatus.failed]: 'status-failed',
} as const;

const STATUS_CLASSES = {
  [LeadEnrichmentStatus.idle]: 'text-zinc-500',
  [LeadEnrichmentStatus.pending]:
    'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  [LeadEnrichmentStatus.enriched]:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  [LeadEnrichmentStatus.failed]:
    'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
} as const;

function formatCell(value: unknown, type: LeadColumn['type']): string {
  if (value == null || value === '') {
    return '';
  }
  if (type === 'boolean') {
    return value ? '✓' : '✗';
  }
  if (type === 'number' && typeof value === 'number') {
    return value.toLocaleString();
  }
  return String(value);
}

export function LeadsGrid({ columns, leads }: Props) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Record<string, LeadEnrichmentStatus>
  >({});
  const [inFlight, setInFlight] = useState<Set<string>>(() => new Set());
  const [nipModalLead, setNipModalLead] = useState<LeadDto | null>(null);

  const csvColumns = useMemo(
    () => columns.filter((c) => c.source === 'csv'),
    [columns],
  );
  const enrichmentColumns = useMemo(
    () => columns.filter((c) => c.source === 'enrichment'),
    [columns],
  );
  const orderedColumns = useMemo(
    () => [...csvColumns, ...enrichmentColumns],
    [csvColumns, enrichmentColumns],
  );

  const clearOptimistic = useCallback((publicId: string) => {
    setOptimisticStatuses((s) => {
      if (!(publicId in s)) {
        return s;
      }
      const next = { ...s };
      delete next[publicId];
      return next;
    });
    setInFlight((s) => {
      if (!s.has(publicId)) {
        return s;
      }
      const next = new Set(s);
      next.delete(publicId);
      return next;
    });
  }, []);

  const handleEnrich = useCallback(
    async (lead: LeadDto) => {
      let added = false;
      setInFlight((s) => {
        if (s.has(lead.publicId)) {
          return s;
        }
        added = true;
        return new Set(s).add(lead.publicId);
      });
      if (!added) {
        return;
      }
      setOptimisticStatuses((s) => ({
        ...s,
        [lead.publicId]: LeadEnrichmentStatus.pending,
      }));

      try {
        const result = await enrichLead({ leadPublicId: lead.publicId });
        if (result.status === 'enriched') {
          toast.success(t('enrich-success'));
        } else if (result.status === 'failed') {
          toast.error(result.error ?? t('enrich-failed'));
        }
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('enrich-failed');
        if (message.includes('infer')) {
          toast.error(t('enrich-no-lookup'));
        } else {
          toast.error(message);
        }
      } finally {
        clearOptimistic(lead.publicId);
      }
    },
    [router, t, clearOptimistic],
  );

  return (
    <div
      role="region"
      aria-label={t('title')}
      tabIndex={0}
      className="h-full overflow-auto bg-zinc-50 outline-none dark:bg-zinc-950"
    >
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-30 bg-zinc-100 dark:bg-zinc-900">
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-40 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
              style={{ width: ROW_NUMBER_WIDTH }}
            >
              #
            </th>
            {orderedColumns.map((col, idx) => (
              <th
                key={col.key}
                scope="col"
                className={clsx(
                  'border-b border-r border-zinc-200 px-3 py-2 text-left text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300',
                  col.source === 'enrichment' &&
                    'bg-violet-50/60 dark:bg-violet-950/30',
                  idx === csvColumns.length &&
                    'border-l-2 border-l-violet-300 dark:border-l-violet-700',
                )}
                style={{ minWidth: DEFAULT_COL_WIDTH }}
              >
                {col.label}
              </th>
            ))}
            <th
              scope="col"
              className="sticky right-0 z-40 border-b border-l border-zinc-200 bg-zinc-100 px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
              style={{ width: ACTION_COL_WIDTH }}
            >
              {t('enrich-button')}
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-zinc-950">
          {leads.map((lead) => {
            const status =
              optimisticStatuses[lead.publicId] ?? lead.enrichmentStatus;
            const isEnriching = inFlight.has(lead.publicId);
            const enrichLabel = `${t('enrich-button')} (${t('row-count', {
              count: lead.rowIndex + 1,
            })})`;
            return (
              <tr key={lead.publicId} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-r border-zinc-200 bg-white px-2 py-1.5 text-left text-xs font-normal text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900"
                  style={{ width: ROW_NUMBER_WIDTH }}
                >
                  {lead.rowIndex + 1}
                </th>
                {orderedColumns.map((col, idx) => {
                  const value = lead.data[col.key];
                  const cell = formatCell(value, col.type);
                  return (
                    <td
                      key={col.key}
                      className={clsx(
                        'truncate border-b border-r border-zinc-200 px-3 py-1.5 dark:border-zinc-800',
                        col.source === 'enrichment'
                          ? 'bg-violet-50/30 dark:bg-violet-950/15'
                          : 'bg-white dark:bg-zinc-950',
                        idx === csvColumns.length &&
                          'border-l-2 border-l-violet-300 dark:border-l-violet-700',
                        'group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900',
                      )}
                      style={{
                        maxWidth: DEFAULT_COL_WIDTH * 2,
                        minWidth: DEFAULT_COL_WIDTH,
                      }}
                      title={cell}
                    >
                      <span className="block truncate">{cell}</span>
                    </td>
                  );
                })}
                <td
                  className="sticky right-0 z-10 border-b border-l border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900"
                  style={{ width: ACTION_COL_WIDTH }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                        STATUS_CLASSES[status],
                      )}
                    >
                      {t(STATUS_LABEL_KEYS[status])}
                    </span>
                    {status === LeadEnrichmentStatus.failed && (
                      <button
                        type="button"
                        onClick={() => setNipModalLead(lead)}
                        aria-label={t('manual-enrich-title')}
                        className="inline-flex items-center rounded px-1.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        <WrenchScrewdriverIcon className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleEnrich(lead)}
                      disabled={isEnriching}
                      aria-label={enrichLabel}
                      className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      {isEnriching ? (
                        <ArrowPathIcon className="size-3.5 animate-spin" />
                      ) : (
                        <SparklesIcon className="size-3.5" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ManualNipModal
        lead={nipModalLead}
        onClose={() => setNipModalLead(null)}
      />
    </div>
  );
}
