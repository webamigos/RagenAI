'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
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
  info: 'bg-muted text-foreground',
  warn: 'bg-pending-tint text-pending dark:bg-pending/40',
  critical: 'bg-crimson-50 text-destructive dark:bg-crimson-950/40',
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
    router.push(`/organization/security${qs ? `?${qs}` : ''}`);
  };

  const handleResolve = (publicId: string) => {
    startTransition(async () => {
      const res = await resolveOrgSecurityEventAction(publicId);
      if (!res.ok) {
        toast.error(t(`resolveError.${res.reason}`));
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
          className="rounded-md border border-border bg-white px-2 py-1 dark:bg-background"
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
          className="rounded-md border border-border bg-white px-2 py-1 dark:bg-background"
        >
          <option value="">{t('filters.all')}</option>
          <option value="false">{t('filters.unresolved')}</option>
          <option value="true">{t('filters.resolved')}</option>
        </select>
        <select
          value={filters.period ?? '7d'}
          onChange={(e) => handleFilterChange('period', e.target.value)}
          aria-label={t('filters.all')}
          className="rounded-md border border-border bg-white px-2 py-1 dark:bg-background"
        >
          <option value="1d">{t('period.1d')}</option>
          <option value="7d">{t('period.7d')}</option>
          <option value="30d">{t('period.30d')}</option>
        </select>
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {t('totalCount', { count: result.totalCount })}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted dark:bg-card/50">
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
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </td>
              </tr>
            )}
            {result.items.map((event) => (
              <tr key={event.publicId} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">
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
                <td className="px-3 py-2 text-muted-foreground">
                  {event.user?.email ?? event.userId ?? '—'}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {event.ipAddress ?? '—'}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
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
        <div className="flex items-center justify-between text-xs text-muted-foreground">
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
                className="rounded-md border border-border px-2 py-1 hover:bg-muted dark:hover:bg-card"
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
                className="rounded-md border border-border px-2 py-1 hover:bg-muted dark:hover:bg-card"
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
