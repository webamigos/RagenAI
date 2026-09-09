'use client';

import { useTranslations } from 'next-intl';
import type {
  OptimizationSuggestion,
  SuggestionDimensions,
} from '@/features/documents/contracts/optimization-suggestion.types';

function dimensionTagClass(confidence: 'high' | 'medium' | 'low'): string {
  if (confidence === 'high') {
    return 'bg-ready-tint text-ready dark:bg-ready/15 dark:text-ready';
  }
  if (confidence === 'medium') {
    return 'bg-accent text-primary dark:bg-accent dark:text-primary';
  }
  return 'bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground';
}

type Props = {
  suggestion: OptimizationSuggestion;
  isAccepted: boolean;
  isRejected: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onUndo: (id: string) => void;
  onShowDetails: (suggestion: OptimizationSuggestion) => void;
};

function cardBorderClass(isAccepted: boolean, isRejected: boolean): string {
  if (isAccepted) {
    return 'border-ready bg-ready-tint dark:border-ready dark:bg-ready/15';
  }
  if (isRejected) {
    return 'border-destructive/40 bg-crimson-50 dark:border-destructive dark:bg-crimson-950/20';
  }
  return 'border-border bg-white dark:border-border dark:bg-muted';
}

export function SuggestionCard({
  suggestion,
  isAccepted,
  isRejected,
  onAccept,
  onReject,
  onUndo,
  onShowDetails,
}: Props) {
  const t = useTranslations('document-optimize');
  const improvedDimensions = Object.entries(suggestion.dimensions ?? {}).filter(
    ([, v]) => v?.improved,
  ) as [
    keyof SuggestionDimensions,
    NonNullable<SuggestionDimensions[keyof SuggestionDimensions]>,
  ][];

  return (
    <div
      className={`rounded-lg border p-4 shadow-sm transition-colors ${cardBorderClass(isAccepted, isRejected)}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground dark:bg-muted dark:text-foreground">
              {t(`type.${suggestion.type}` as never)}
            </span>
            {improvedDimensions.map(([key, val]) => (
              <span
                key={key}
                className={`rounded-md px-2 py-0.5 text-xs font-medium ${dimensionTagClass(val.confidence)}`}
              >
                ↑ {t(`dimension.${key}` as never)}
              </span>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {suggestion.rationale}
          </p>
          <p className="text-xs text-muted-foreground">{suggestion.location}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isAccepted && !isRejected && (
            <button
              onClick={() => onShowDetails(suggestion)}
              className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted"
            >
              {t('details')}
            </button>
          )}
          {isAccepted && (
            <>
              <button
                onClick={() => onReject(suggestion.id)}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted dark:border-border dark:text-foreground dark:hover:bg-muted"
              >
                {t('reject')}
              </button>
              <button
                onClick={() => onUndo(suggestion.id)}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted dark:border-border dark:text-foreground dark:hover:bg-muted"
              >
                {t('undo')}
              </button>
            </>
          )}
          {isRejected && (
            <>
              <button
                onClick={() => onAccept(suggestion.id)}
                className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
              >
                {t('accept')}
              </button>
              <button
                onClick={() => onUndo(suggestion.id)}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted dark:border-border dark:text-foreground dark:hover:bg-muted"
              >
                {t('undo')}
              </button>
            </>
          )}
          {!isAccepted && !isRejected && (
            <>
              <button
                onClick={() => onReject(suggestion.id)}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted dark:border-border dark:text-foreground dark:hover:bg-muted"
              >
                {t('reject')}
              </button>
              <button
                onClick={() => onAccept(suggestion.id)}
                className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
              >
                {t('accept')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
