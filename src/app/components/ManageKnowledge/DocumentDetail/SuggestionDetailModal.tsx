'use client';

import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import type { OptimizationSuggestion } from '@/features/documents/contracts/optimization-suggestion.types';

type Props = {
  suggestion: OptimizationSuggestion | null;
  isOpen: boolean;
  onClose: () => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isAccepted: boolean;
};

export function SuggestionDetailModal({
  suggestion,
  isOpen,
  onClose,
  onAccept,
  onReject,
  isAccepted,
}: Props) {
  if (!suggestion) {
    return null;
  }

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>Szczegóły sugestii</DialogTitle>
      <DialogBody>
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-gray-500">
              Uzasadnienie
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {suggestion.rationale}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-gray-500">
              Przed
            </p>
            <pre className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              {suggestion.before}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-gray-500">
              Po
            </p>
            <pre className="rounded bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
              {suggestion.after}
            </pre>
          </div>
          <div>
            <p className="text-xs text-gray-500">
              Przewidywany wpływ na score:{' '}
              <span
                className={
                  suggestion.expectedScoreDelta >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }
              >
                {suggestion.expectedScoreDelta >= 0 ? '+' : ''}
                {suggestion.expectedScoreDelta} pkt
              </span>
            </p>
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button outline onClick={onClose}>
          Zamknij
        </Button>
        {isAccepted ? (
          <Button
            outline
            onClick={() => {
              onReject(suggestion.id);
              onClose();
            }}
          >
            Odrzuć
          </Button>
        ) : (
          <Button
            onClick={() => {
              onAccept(suggestion.id);
              onClose();
            }}
          >
            Zaakceptuj
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
