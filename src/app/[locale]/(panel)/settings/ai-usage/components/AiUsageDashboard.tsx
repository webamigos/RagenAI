'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type {
  AiUsageDashboardData,
  AiUsageFilters,
} from '@/features/ai-usage/contracts/ai-usage.types';
import { getAiUsageDashboard } from '../actions';
import { AiUsageSummaryCards } from './AiUsageSummaryCards';
import { AiUsageFiltersBar } from './AiUsageFiltersBar';
import { AiUsageCharts } from './AiUsageCharts';
import { AiUsageTable } from './AiUsageTable';

export function AiUsageDashboard() {
  const [data, setData] = useState<AiUsageDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<AiUsageFilters>({ period: '30d' });

  const loadData = useCallback(async (f: AiUsageFilters) => {
    setIsLoading(true);
    try {
      const result = await getAiUsageDashboard(f);
      setData(result);
    } catch {
      toast.error('Failed to load AI usage data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(filters);
  }, [filters, loadData]);

  const handleFiltersChange = (newFilters: AiUsageFilters) => {
    setFilters(newFilters);
  };

  if (isLoading && !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-lg" />
          ))}
        </div>
        <div className="h-8 bg-muted rounded w-64" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AiUsageFiltersBar filters={filters} onChange={handleFiltersChange} />

      {data && (
        <>
          <AiUsageSummaryCards summary={data.summary} isLoading={isLoading} />
          <AiUsageCharts charts={data.charts} />
          <AiUsageTable items={data.items} />
        </>
      )}

      {!isLoading && data && data.items.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          No AI usage data found for the selected filters.
        </p>
      )}
    </div>
  );
}
