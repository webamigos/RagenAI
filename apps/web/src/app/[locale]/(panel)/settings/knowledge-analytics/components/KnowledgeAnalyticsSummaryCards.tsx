'use client';

import { useTranslations } from 'next-intl';
import { MessageSquare, Users, ThumbsUp } from 'lucide-react';
import type { KnowledgeAnalyticsSummary } from '@/features/documents/contracts/knowledge-analytics.types';

type Props = {
  summary: KnowledgeAnalyticsSummary;
  isLoading: boolean;
};

export function KnowledgeAnalyticsSummaryCards({ summary, isLoading }: Props) {
  const t = useTranslations('settings-page.knowledge-analytics.summary');

  const positiveRate = summary.positiveRatePct;

  function getRateIconBg(rate: number) {
    if (rate >= 80) {
      return 'bg-green-50 dark:bg-green-950/40';
    }
    if (rate >= 60) {
      return 'bg-yellow-50 dark:bg-yellow-950/40';
    }
    return 'bg-red-50 dark:bg-red-950/40';
  }

  function getRateIconColor(rate: number) {
    if (rate >= 80) {
      return 'text-green-500';
    }
    if (rate >= 60) {
      return 'text-yellow-500';
    }
    return 'text-red-500';
  }

  function getRateValueColor(rate: number) {
    if (rate >= 80) {
      return 'text-green-600 dark:text-green-400';
    }
    if (rate >= 60) {
      return 'text-yellow-600 dark:text-yellow-400';
    }
    return 'text-red-600 dark:text-red-400';
  }

  const cards = [
    {
      label: t('total-questions'),
      value: summary.totalQuestions.toLocaleString(),
      icon: MessageSquare,
      iconBg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-500',
      valueColor: 'text-foreground',
    },
    {
      label: t('unique-users'),
      value: summary.uniqueUsers.toLocaleString(),
      icon: Users,
      iconBg: 'bg-violet-50 dark:bg-violet-950/40',
      iconColor: 'text-violet-500',
      valueColor: 'text-foreground',
    },
    {
      label: t('positive-rate'),
      value: `${summary.positiveRatePct.toFixed(1)}%`,
      icon: ThumbsUp,
      iconBg: getRateIconBg(positiveRate),
      iconColor: getRateIconColor(positiveRate),
      valueColor: getRateValueColor(positiveRate),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={`rounded-xl border bg-card p-5 flex items-center gap-4 ${isLoading ? 'opacity-60' : ''}`}
          >
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${card.iconBg}`}
            >
              <Icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium truncate">
                {card.label}
              </p>
              <p
                className={`text-2xl font-bold tabular-nums mt-0.5 ${card.valueColor}`}
              >
                {card.value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
