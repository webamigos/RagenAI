'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type {
  AuditLogFilters,
  AuditLogPaginatedResult,
  AuditLogFilterOptions,
} from '@/features/audit-logs/contracts/audit-log.types';
import { getAuditLogs, getAuditLogFilterOptions } from '../actions';
import { AuditLogsFiltersBar } from './AuditLogsFiltersBar';
import { AuditLogsTable } from './AuditLogsTable';

export function AuditLogsDashboard() {
  const [data, setData] = useState<AuditLogPaginatedResult | null>(null);
  const [filterOptions, setFilterOptions] =
    useState<AuditLogFilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<AuditLogFilters>({
    period: '30d',
    page: 1,
  });
  const latestRequestIdRef = useRef(0);

  const loadData = useCallback(async (f: AuditLogFilters) => {
    const requestId = ++latestRequestIdRef.current;
    setIsLoading(true);
    try {
      const result = await getAuditLogs(f);
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      setData(result);
    } catch {
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      toast.error('Failed to load audit logs');
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    getAuditLogFilterOptions()
      .then(setFilterOptions)
      .catch(() => {
        /* filter options are non-critical */
      });
  }, []);

  useEffect(() => {
    loadData(filters);
  }, [filters, loadData]);

  const handleFiltersChange = (newFilters: AuditLogFilters) => {
    setFilters({ ...newFilters, page: 1 });
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  if (isLoading && !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 w-64 rounded bg-muted" />
        <div className="h-64 rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AuditLogsFiltersBar
        filters={filters}
        filterOptions={filterOptions}
        onChange={handleFiltersChange}
      />

      {data && (
        <AuditLogsTable
          data={data}
          isLoading={isLoading}
          onPageChange={handlePageChange}
        />
      )}

      {!isLoading && data && data.items.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          No audit logs found for the selected filters.
        </p>
      )}
    </div>
  );
}
