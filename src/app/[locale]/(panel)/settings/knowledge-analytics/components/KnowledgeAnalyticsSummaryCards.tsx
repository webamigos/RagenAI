'use client';

import { useTranslations } from 'next-intl';
import type { KnowledgeAnalyticsSummary } from '@/features/documents/contracts/knowledge-analytics.types';

type Props = {
  summary: KnowledgeAnalyticsSummary;
  isLoading: boolean;
};

export function KnowledgeAnalyticsSummaryCards({ summary, isLoading }: Props) {
  const t = useTranslations('settings-page.knowledge-analytics.summary');

  const cards = [
    {
      label: t('total-questions'),
      value: summary.totalQuestions.toLocaleString(),
    },
    { label: t('unique-users'), value: summary.uniqueUsers.toLocaleString() },
    {
      label: t('positive-rate'),
      value: `${summary.positiveRatePct.toFixed(1)}%`,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border bg-card p-4 ${isLoading ? 'opacity-60' : ''}`}
        >
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {card.label}
          </p>
          <p className="text-2xl font-bold mt-1">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
