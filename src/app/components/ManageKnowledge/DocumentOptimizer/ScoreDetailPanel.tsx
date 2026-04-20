'use client';

import { useTranslations, useLocale } from 'next-intl';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import type { RagScore } from '@/features/documents/contracts/rag-score.types';

type Props = {
  open: boolean;
  onClose: () => void;
  score: RagScore;
  scoredAt?: string;
  onRescore?: () => void;
  isRescoring?: boolean;
};

const DIMENSIONS = [
  { key: 'chunkStructure', labelKey: 'score-chunk-structure' },
  { key: 'avgChunkSize', labelKey: 'score-avg-chunk-size' },
  { key: 'entityDensity', labelKey: 'score-entity-density' },
  { key: 'selfContainedness', labelKey: 'score-self-containedness' },
  { key: 'qaAdherence', labelKey: 'score-qa-adherence' },
] as const;

function getScoreColor(value: number, max: number) {
  const ratio = value / max;
  if (ratio >= 0.7) {
    return 'bg-green-500 dark:bg-green-400';
  }
  if (ratio >= 0.4) {
    return 'bg-amber-500 dark:bg-amber-400';
  }
  return 'bg-red-500 dark:bg-red-400';
}

function getTotalColor(total: number) {
  if (total >= 70) {
    return 'text-green-600 dark:text-green-400';
  }
  if (total >= 40) {
    return 'text-amber-600 dark:text-amber-400';
  }
  return 'text-red-600 dark:text-red-400';
}

export function ScoreDetailPanel({
  open,
  onClose,
  score,
  scoredAt,
  onRescore,
  isRescoring,
}: Props) {
  const t = useTranslations('document-optimizer');
  const locale = useLocale();

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>{t('score-detail-title')}</DialogTitle>
      <DialogBody>
        {/* Overall score */}
        <div className="mb-6 text-center">
          <span className={`text-5xl font-bold ${getTotalColor(score.total)}`}>
            {Math.round(score.total)}
          </span>
          <span className="text-lg text-zinc-400 dark:text-zinc-500">/100</span>
        </div>

        {/* Dimension bars */}
        <div className="space-y-3">
          {DIMENSIONS.map(({ key, labelKey }) => {
            const value = score[key];
            return (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {t(labelKey)}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400 font-mono">
                    {value}/10
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className={`h-2 rounded-full transition-all ${getScoreColor(value, 10)}`}
                    style={{ width: `${(value / 10) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Suggestions */}
        {score.suggestions.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              {t('score-suggestions')}
            </h4>
            <ol className="list-decimal list-inside space-y-1.5">
              {score.suggestions.map((suggestion, i) => (
                <li
                  key={i}
                  className="text-sm text-zinc-600 dark:text-zinc-400"
                >
                  {suggestion}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Scored at */}
        {scoredAt && (
          <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
            {t('score-at')}: {new Date(scoredAt).toLocaleString(locale)}
          </p>
        )}
      </DialogBody>
      <DialogActions>
        {onRescore && (
          <Button outline onClick={onRescore} isLoading={isRescoring}>
            {t('rescore')}
          </Button>
        )}
        <Button onClick={onClose}>{t('ok')}</Button>
      </DialogActions>
    </Dialog>
  );
}
