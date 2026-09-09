'use client';

import { useTranslations } from 'next-intl';

function getScoreColor(total: number) {
  if (total >= 70) {
    return 'bg-ready-tint text-ready dark:bg-ready/15 dark:text-ready';
  }
  if (total >= 40) {
    return 'bg-pending-tint text-pending dark:bg-pending/15 dark:text-pending';
  }
  return 'bg-crimson-50 text-destructive dark:bg-crimson-950/30 dark:text-destructive';
}

export function RagScoreBadge({ metadata }: { metadata?: unknown }) {
  const t = useTranslations('document-optimizer');

  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const meta = metadata as { ragScore?: { total?: unknown } };
  if (
    !meta.ragScore ||
    typeof meta.ragScore !== 'object' ||
    typeof meta.ragScore.total !== 'number'
  ) {
    return null;
  }

  const total = Math.round(meta.ragScore.total);

  return (
    <span
      title={t('score-tooltip', { score: total })}
      data-testid="rag-score-badge"
      className={`ml-1.5 mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${getScoreColor(total)}`}
    >
      {t('badge-label', { score: total })}
    </span>
  );
}
