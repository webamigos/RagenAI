'use client';

import { useTranslations } from 'next-intl';

import { useOrgFeature } from '@/app/hooks/useOrgFeatures';

/**
 * One neutral colour at every score. Green, amber and crimson are the
 * document-state vocabulary (panel rules 11, 16, 17), so a low score in
 * crimson read as a failed ingest beside the Failed badge. The number carries
 * its scale instead (rule 23): "RAG 16/100".
 */
export function RagScoreBadge({ metadata }: { metadata?: unknown }) {
  const t = useTranslations('document-optimizer');
  // Off (`ragReadinessScore`, set in apps/admin): no badge, including a score
  // stored before the key was turned off.
  const scoringEnabled = useOrgFeature('ragReadinessScore');

  if (!scoringEnabled || !metadata || typeof metadata !== 'object') {
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
      className="ml-1.5 mt-0.5 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground tabular-nums"
    >
      {t('badge-label', { score: total })}
    </span>
  );
}
