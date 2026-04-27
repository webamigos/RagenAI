'use client';

import type { AiUsageSummary } from '@/features/ai-usage/contracts/ai-usage.types';

type Props = {
  summary: AiUsageSummary;
  isLoading: boolean;
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toLocaleString();
}

function formatCost(n: number): string {
  return `€${n.toFixed(4)}`;
}

export function AiUsageSummaryCards({ summary, isLoading }: Props) {
  const cards = [
    {
      label: 'Total Calls',
      value: summary.totalCalls.toLocaleString(),
    },
    {
      label: 'Total Tokens',
      value: formatTokens(summary.totalTokens),
      sub: `${formatTokens(summary.totalInputTokens)} in / ${formatTokens(summary.totalOutputTokens)} out`,
    },
    {
      label: 'Estimated Cost',
      value: formatCost(summary.totalCost),
    },
    {
      label: 'Avg Cost / Call',
      value:
        summary.totalCalls > 0
          ? formatCost(summary.totalCost / summary.totalCalls)
          : '€0.0000',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border bg-card p-4 ${isLoading ? 'opacity-60' : ''}`}
        >
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {card.label}
          </p>
          <p className="text-2xl font-bold mt-1">{card.value}</p>
          {card.sub && (
            <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
