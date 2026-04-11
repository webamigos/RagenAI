'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import type {
  SecurityEventPaginatedResult,
  SecurityEventFilters,
  SecurityEventRow,
} from '@/features/security/contracts/security-event.types';
import { resolveOrgSecurityEventAction } from '../actions';
import { SecurityEventDetailDialog } from './SecurityEventDetailDialog';

type Props = {
  result: SecurityEventPaginatedResult;
  filters: SecurityEventFilters;
};

const SEVERITY_BADGE: Record<string, string> = {
  info: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function SecurityEventsTable({ result, filters }: Props) {
  const t = useTranslations('settings-security');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedEvent, setSelectedEvent] = useState<SecurityEventRow | null>(
    null,
  );

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams();
    if (filters.severity && key !== 'severity') {
      params.set('severity', filters.severity);
    }
    if (filters.resolved !== undefined && key !== 'resolved') {
      params.set('resolved', String(filters.resolved));
    }
    if (filters.period && key !== 'period') {
      params.set('period', filters.period);
    }
    if (value) {
      params.set(key, value);
    }
    const qs = params.toString();
    router.push(`/settings/security${qs ? `?${qs}` : ''}`);
  };

  const handleResolve = (publicId: string) => {
    startTransition(async () => {
      const res = await resolveOrgSecurityEventAction(publicId);
      if (!res.ok) {
        // eslint-disable-next-line no-alert
        alert(t(`resolveError.${res.reason}`));
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 text-sm">
        <select
          value={filters.severity ?? ''}
          onChange={(e) => handleFilterChange('severity', e.target.value)}
          aria-label={t('columns.severity')}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="">{t('filters.allSeverities')}</option>
          <option value="info">{t('severity.info')}</option>
          <option value="warn">{t('severity.warn')}</option>
          <option value="critical">{t('severity.critical')}</option>
        </select>
        <select
          value={filters.resolved === undefined ? '' : String(filters.resolved)}
          onChange={(e) => handleFilterChange('resolved', e.target.value)}
          aria-label={t('columns.resolved')}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="">{t('filters.all')}</option>
          <option value="false">{t('filters.unresolved')}</option>
          <option value="true">{t('filters.resolved')}</option>
        </select>
        <select
          value={filters.period ?? '7d'}
          onChange={(e) => handleFilterChange('period', e.target.value)}
          aria-label={t('filters.all')}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="1d">{t('period.1d')}</option>
          <option value="7d">{t('period.7d')}</option>
          <option value="30d">{t('period.30d')}</option>
        </select>
        <span className="ml-auto self-center text-xs text-zinc-500">
          {t('totalCount', { count: result.totalCount })}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                {t('columns.time')}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t('columns.severity')}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t('columns.eventType')}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t('columns.user')}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t('columns.ip')}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t('columns.resolved')}
              </th>
              <th className="w-20 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  {t('empty')}
                </td>
              </tr>
            )}
            {result.items.map((event) => (
              <tr
                key={event.publicId}
                className="border-t border-zinc-200 dark:border-zinc-800"
              >
                <td className="px-3 py-2 text-zinc-500">
                  {new Date(event.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      SEVERITY_BADGE[event.severity] ?? SEVERITY_BADGE.info
                    }`}
                  >
                    {t(`severity.${event.severity}`)}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {event.eventType}
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                  {event.user?.email ?? event.userId ?? '—'}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                  {event.ipAddress ?? '—'}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-500">
                  {event.resolvedAt
                    ? new Date(event.resolvedAt).toLocaleDateString()
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setSelectedEvent(event)}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('actions.view')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination (minimal) */}
      {result.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {t('page', {
              page: result.page,
              totalPages: result.totalPages,
            })}
          </span>
          <div className="flex gap-2">
            {result.page > 1 && (
              <button
                type="button"
                onClick={() =>
                  handleFilterChange('page', String(result.page - 1))
                }
                className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                {t('pagination.prev')}
              </button>
            )}
            {result.page < result.totalPages && (
              <button
                type="button"
                onClick={() =>
                  handleFilterChange('page', String(result.page + 1))
                }
                className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                {t('pagination.next')}
              </button>
            )}
          </div>
        </div>
      )}

      <SecurityEventDetailDialog
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onResolve={handleResolve}
        isResolving={isPending}
      />
    </div>
  );
}
