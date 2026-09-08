'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, AlertCircle, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getKnowledgeAnalyticsDashboard } from '@/app/actions/knowledge-analytics';
import type { KnowledgeAnalyticsDashboardData } from '@/features/documents/contracts/knowledge-analytics.types';
import { KnowledgeAnalyticsSummaryCards } from './KnowledgeAnalyticsSummaryCards';
import { DailyQuestionsChart } from './DailyQuestionsChart';
import { TopCitedDocumentsSection } from './TopCitedDocumentsSection';
import { UnusedDocumentsSection } from './UnusedDocumentsSection';
import { NegativeQaTable } from './NegativeQaTable';

export function KnowledgeAnalyticsDashboard() {
  const t = useTranslations('settings-page.knowledge-analytics');
  const [data, setData] = useState<KnowledgeAnalyticsDashboardData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const latestRequestIdRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    setIsLoading(true);
    setError(false);
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
      setError(true);
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="space-y-1">
          <div className="h-7 w-48 bg-muted rounded-lg" />
          <div className="h-4 w-72 bg-muted/60 rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl" />
          ))}
        </div>
        <div className="h-48 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
        <div className="h-48 bg-muted rounded-xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
          <AlertCircle className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <p className="font-medium">{t('error-title')}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{t('error')}</p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
          />
          {t('retry')}
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('description')}
          </p>
          {/*
            The scope, stated where the numbers are read. API traffic reaches
            these tables only when a caller sends `x-debug-mode: 1`, and the
            queries now exclude it — but an absence is invisible, and someone
            comparing this page against their API dashboard needs to know
            which of the two is wrong before they go looking.
          */}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground mt-2">
            <Info className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
            <span>{t('api-excluded')}</span>
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={loadData}
                disabled={isLoading}
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{t('refresh')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <KnowledgeAnalyticsSummaryCards
        summary={data.summary}
        isLoading={isLoading}
      />
      <DailyQuestionsChart items={data.dailyQuestions} isLoading={isLoading} />
      <TopCitedDocumentsSection items={data.topCited} isLoading={isLoading} />
      <UnusedDocumentsSection items={data.unusedDocs} isLoading={isLoading} />
      <NegativeQaTable initialData={data.negativeQa} isLoading={isLoading} />
    </div>
  );
}
