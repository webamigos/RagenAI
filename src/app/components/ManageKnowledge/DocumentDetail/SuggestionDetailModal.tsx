'use client';

import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import type {
  OptimizationSuggestion,
  SuggestionDimensions,
} from '@/features/documents/contracts/optimization-suggestion.types';

const DIMENSION_LABELS: Record<keyof SuggestionDimensions, string> = {
  chunkStructure: 'Struktura',
  avgChunkSize: 'Rozmiar chunków',
  entityDensity: 'Encje',
  selfContainedness: 'Samowystarczalność',
  qaAdherence: 'Format Q&A',
};

const CONFIDENCE_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: 'wysoka',
  medium: 'średnia',
  low: 'niska',
};

type Props = {
  suggestion: OptimizationSuggestion | null;
  isOpen: boolean;
  onClose: () => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onUndo: (id: string) => void;
  isAccepted: boolean;
  isRejected: boolean;
};

export function SuggestionDetailModal({
  suggestion,
  isOpen,
  onClose,
  onAccept,
  onReject,
  onUndo,
  isAccepted,
  isRejected,
}: Props) {
  if (!suggestion) {
    return null;
  }

  const improvedDimensions = Object.entries(suggestion.dimensions ?? {}).filter(
    ([, v]) => v?.improved,
  ) as [
    keyof SuggestionDimensions,
    NonNullable<SuggestionDimensions[keyof SuggestionDimensions]>,
  ][];

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>Szczegóły sugestii</DialogTitle>
      <DialogBody className="max-h-[60vh] overflow-y-auto">
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-zinc-500">
              Uzasadnienie
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {suggestion.rationale}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-zinc-500">
              Przed
            </p>
            {suggestion.before ? (
              <pre className="whitespace-pre-wrap rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
                {suggestion.before}
              </pre>
            ) : (
              <p className="text-sm italic text-zinc-400">
                Dotyczy struktury całego dokumentu
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-zinc-500">
              Po
            </p>
            {suggestion.after ? (
              <pre className="whitespace-pre-wrap rounded bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
                {suggestion.after}
              </pre>
            ) : (
              <p className="text-sm italic text-zinc-400">
                Dotyczy struktury całego dokumentu
              </p>
            )}
          </div>
          {improvedDimensions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase text-zinc-500">
                Poprawiane wymiary RAG
              </p>
              <div className="space-y-2">
                {improvedDimensions.map(([key, val]) => (
                  <div
                    key={key}
                    className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-800"
                  >
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      ↑ {DIMENSION_LABELS[key]}{' '}
                      <span className="font-normal text-zinc-400">
                        (pewność: {CONFIDENCE_LABELS[val.confidence]})
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {val.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button outline onClick={onClose}>
          Zamknij
        </Button>
        {isAccepted || isRejected ? (
          <Button
            outline
            onClick={() => {
              onUndo(suggestion.id);
              onClose();
            }}
          >
            Cofnij
          </Button>
        ) : (
          <>
            <Button
              outline
              onClick={() => {
                onReject(suggestion.id);
                onClose();
              }}
            >
              Odrzuć
            </Button>
            <Button
              onClick={() => {
                onAccept(suggestion.id);
                onClose();
              }}
            >
              Zaakceptuj
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
