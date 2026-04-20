'use client';

import { useTranslations } from 'next-intl';

function getScoreColor(total: number) {
  if (total >= 70) {
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  }
  if (total >= 40) {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  }
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
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
