'use client';

import type {
  OptimizationSuggestion,
  SuggestionType,
} from '@/features/documents/contracts/optimization-suggestion.types';

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
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onShowDetails: (suggestion: OptimizationSuggestion) => void;
};

export function SuggestionCard({
  suggestion,
  isAccepted,
  onAccept,
  onReject,
  onShowDetails,
}: Props) {
  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isAccepted
          ? 'border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-950/20'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {TYPE_LABELS[suggestion.type]}
            </span>
            <span
              className={`text-xs font-medium ${
                suggestion.expectedScoreDelta >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {suggestion.expectedScoreDelta >= 0 ? '+' : ''}
              {suggestion.expectedScoreDelta} pkt
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {suggestion.rationale}
          </p>
          <p className="text-xs text-gray-400">{suggestion.location}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => onShowDetails(suggestion)}
            className="rounded px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Szczegóły
          </button>
          {isAccepted ? (
            <button
              onClick={() => onReject(suggestion.id)}
              className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
            >
              Odrzuć
            </button>
          ) : (
            <button
              onClick={() => onAccept(suggestion.id)}
              className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
            >
              Zaakceptuj
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
