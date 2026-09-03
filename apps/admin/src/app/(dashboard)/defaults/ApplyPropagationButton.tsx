'use client';

import { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';

import { applyPropagationAction } from './actions';
import type { PropagationGroup } from './propagation';

/**
 * Confirms, because this writes to every organization on the platform at
 * once, and reports the count it actually changed rather than claiming
 * success — "applied to 3, 14 already matched" is the sentence an
 * administrator needs to trust that the preview was real.
 */
export function ApplyPropagationButton({
  group,
  changedCount,
  configured,
}: {
  group: PropagationGroup;
  changedCount: number;
  /** False when no default has been saved — a different nothing. */
  configured: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setPending(true);
    setError(null);
    try {
      const outcome = await applyPropagationAction(group);
      setResult(
        `Applied to ${outcome.applied} organization${
          outcome.applied === 1 ? '' : 's'
        }; ${outcome.unchanged} already matched.`,
      );
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setPending(false);
    }
  };

  if (!configured) {
    // The heading already explains this; the button must not claim that
    // everything matches a default that does not exist.
    return null;
  }

  if (changedCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to apply — every organization already matches this default.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
          >
            {pending
              ? 'Applying…'
              : `Write to ${changedCount} organization${
                  changedCount === 1 ? '' : 's'
                }`}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md border border-input px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <span className="text-sm text-muted-foreground">
            Changes customer-visible settings. There is no undo.
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <ArrowRightLeft className="h-4 w-4" />
          Apply to existing organizations
        </button>
      )}

      {result && (
        <p role="status" className="text-sm text-muted-foreground">
          {result} Reload to see the new state.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
