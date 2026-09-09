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
    return 'bg-ready';
  }
  if (ratio >= 0.4) {
    return 'bg-pending';
  }
  return 'bg-destructive';
}

function getTotalColor(total: number) {
  if (total >= 70) {
    return 'text-ready';
  }
  if (total >= 40) {
    return 'text-pending';
  }
  return 'text-destructive';
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
          <span className="text-lg text-muted-foreground">/100</span>
        </div>

        {/* Dimension bars */}
        <div className="space-y-3">
          {DIMENSIONS.map(({ key, labelKey }) => {
            const value = score[key];
            return (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-foreground">{t(labelKey)}</span>
                  <span className="text-muted-foreground font-mono">
                    {value}/10
                  </span>
                </div>
                <div className="h-2 rounded-full bg-paper-200 dark:bg-paper-700">
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
            <h4 className="text-sm font-medium text-foreground mb-2">
              {t('score-suggestions')}
            </h4>
            <ol className="list-decimal list-inside space-y-1.5">
              {score.suggestions.map((suggestion, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  {suggestion}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Scored at */}
        {scoredAt && (
          <p className="mt-4 text-xs text-muted-foreground">
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
