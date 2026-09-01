'use client';

import { useTranslations } from 'next-intl';
import type {
  OptimizationSuggestion,
  SuggestionDimensions,
} from '@/features/documents/contracts/optimization-suggestion.types';

function dimensionTagClass(confidence: 'high' | 'medium' | 'low'): string {
  if (confidence === 'high') {
    return 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400';
  }
  if (confidence === 'medium') {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';
  }
  return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400';
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
    return 'border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-950/20';
  }
  if (isRejected) {
    return 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/20';
  }
  return 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800';
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
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {suggestion.rationale}
          </p>
          <p className="text-xs text-zinc-400">{suggestion.location}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isAccepted && !isRejected && (
            <button
              onClick={() => onShowDetails(suggestion)}
              className="rounded-md px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {t('details')}
            </button>
          )}
          {isAccepted && (
            <>
              <button
                onClick={() => onReject(suggestion.id)}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t('reject')}
              </button>
              <button
                onClick={() => onUndo(suggestion.id)}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t('undo')}
              </button>
            </>
          )}
          {isRejected && (
            <>
              <button
                onClick={() => onAccept(suggestion.id)}
                className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                {t('accept')}
              </button>
              <button
                onClick={() => onUndo(suggestion.id)}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t('undo')}
              </button>
            </>
          )}
          {!isAccepted && !isRejected && (
            <>
              <button
                onClick={() => onReject(suggestion.id)}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t('reject')}
              </button>
              <button
                onClick={() => onAccept(suggestion.id)}
                className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
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
