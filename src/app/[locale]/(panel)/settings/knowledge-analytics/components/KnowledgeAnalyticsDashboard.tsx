'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getKnowledgeAnalyticsDashboard } from '@/app/actions/knowledge-analytics';
import type { KnowledgeAnalyticsDashboardData } from '@/features/documents/contracts/knowledge-analytics.types';
import { KnowledgeAnalyticsSummaryCards } from './KnowledgeAnalyticsSummaryCards';
import { TopCitedDocumentsSection } from './TopCitedDocumentsSection';
import { UnusedDocumentsSection } from './UnusedDocumentsSection';
import { NegativeQaTable } from './NegativeQaTable';

export function KnowledgeAnalyticsDashboard() {
  const t = useTranslations('settings-page.knowledge-analytics');
  const [data, setData] = useState<KnowledgeAnalyticsDashboardData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const latestRequestIdRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    setIsLoading(true);
    try {
      const result = await getKnowledgeAnalyticsDashboard();
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      setData(result);
    } catch {
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      toast.error(t('error'));
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading && !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-lg" />
          ))}
        </div>
        <div className="h-48 bg-muted rounded" />
        <div className="h-48 bg-muted rounded" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('description')}</p>
      </div>
      <KnowledgeAnalyticsSummaryCards
        summary={data.summary}
        isLoading={isLoading}
      />
      <TopCitedDocumentsSection items={data.topCited} isLoading={isLoading} />
      <UnusedDocumentsSection items={data.unusedDocs} isLoading={isLoading} />
      <NegativeQaTable items={data.negativeQa} isLoading={isLoading} />
    </div>
  );
}
