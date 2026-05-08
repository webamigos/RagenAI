'use client';

import type {
  OptimizationSuggestion,
  SuggestionType,
} from '@/features/documents/contracts/optimization-suggestion.types';

function scoreDeltaColor(delta: number): string {
  if (delta > 0) {
    return 'text-green-600 dark:text-green-400';
  }
  if (delta < 0) {
    return 'text-red-600 dark:text-red-400';
  }
  return 'text-zinc-400';
}

function scoreDeltaLabel(delta: number, stale?: boolean): string {
  if (stale) {
    return 'Sugestia nieaktualna';
  }
  if (delta > 0) {
    return `+${delta} pkt`;
  }
  if (delta < 0) {
    return `${delta} pkt`;
  }
  return 'wpływ trudny do zmierzenia';
}

function scoreDeltaColorWithStale(delta: number, stale?: boolean): string {
  if (stale) {
    return 'text-gray-400 line-through';
  }
  return scoreDeltaColor(delta);
}

const TYPE_LABELS: Record<SuggestionType, string> = {
  restructure: 'Restrukturyzacja',
  chunk_split: 'Rozbicie chunków',
  pronoun_context: 'Kontekst pronominów',
  terminology: 'Terminologia',
  keywords: 'Słowa kluczowe',
  redundancy: 'Redundancja',
};

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
  return (
    <div
      className={`rounded-lg border p-4 shadow-sm transition-colors ${cardBorderClass(isAccepted, isRejected)}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              {TYPE_LABELS[suggestion.type]}
            </span>
            <span
              className={`text-xs font-semibold ${scoreDeltaColorWithStale(suggestion.expectedScoreDelta, suggestion.stale)}`}
            >
              {scoreDeltaLabel(suggestion.expectedScoreDelta, suggestion.stale)}
            </span>
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
              Szczegóły
            </button>
          )}
          {isAccepted && (
            <>
              <button
                onClick={() => onReject(suggestion.id)}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Odrzuć
              </button>
              <button
                onClick={() => onUndo(suggestion.id)}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cofnij
              </button>
            </>
          )}
          {isRejected && (
            <>
              <button
                onClick={() => onAccept(suggestion.id)}
                className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Zaakceptuj
              </button>
              <button
                onClick={() => onUndo(suggestion.id)}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cofnij
              </button>
            </>
          )}
          {!isAccepted && !isRejected && (
            <>
              <button
                onClick={() => onReject(suggestion.id)}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Odrzuć
              </button>
              <button
                onClick={() => onAccept(suggestion.id)}
                className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Zaakceptuj
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
