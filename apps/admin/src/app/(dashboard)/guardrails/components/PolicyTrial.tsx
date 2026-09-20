'use client';

import { useState, useTransition } from 'react';

import { testPolicyAction, type PolicyTrialOutcome } from '../policy-trial';

/**
 * "Test this policy" — score the draft against a message, before it is saved.
 *
 * A policy rule is the one kind whose behaviour an operator cannot read off
 * the form. A pattern either matches a string or it does not; a policy is a
 * sentence handed to a model, and whether it fires on a given message is a
 * question only the model can answer. Without this box the way to find out is
 * to enable the rule and watch real traffic, which for a `BLOCK` policy means
 * finding out from a customer.
 *
 * It runs against the **unsaved** draft on purpose: the point is to try a
 * wording and a threshold before committing to either. Nothing here writes a
 * rule, and the trial never consults `enabled`.
 */
export function PolicyTrial({
  policy,
  threshold,
}: {
  policy: string;
  threshold: number | null;
}) {
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<PolicyTrialOutcome | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      try {
        setOutcome(await testPolicyAction({ policy, threshold, text }));
      } catch {
        // `testPolicyAction` returns its failures; a rejection is the audit
        // write or the guard throwing. Without this the transition ends with
        // no branch having run and the button simply stops looking busy.
        setOutcome({
          outcome: 'unavailable',
          reason: 'The server reported a failure running the trial.',
        });
      }
    });
  };

  return (
    <div className="rounded-md border border-border p-3">
      <label
        htmlFor="guardrail-policy-trial"
        className="mb-1 block text-sm font-medium"
      >
        Test this policy
      </label>
      <p className="mb-2 text-xs text-muted-foreground">
        Paste a message and see what the judge scores it. This runs the same
        model, prompt and threshold a real turn would, and saves nothing.
      </p>
      <textarea
        id="guardrail-policy-trial"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={isPending || policy.trim() === '' || text.trim() === ''}
        onClick={run}
        className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
      >
        {isPending ? 'Asking the judge…' : 'Test'}
      </button>

      {outcome ? <Verdict outcome={outcome} /> : null}
    </div>
  );
}

function Verdict({ outcome }: { outcome: PolicyTrialOutcome }) {
  if (outcome.outcome === 'unavailable' || outcome.outcome === 'error') {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        {/* A judge that could not answer is never shown as a score of zero.
            "It did not fire" and "nobody asked" are the same picture and
            completely different situations — the second is the one worth an
            operator's attention. */}
        <span className="font-medium">No verdict.</span> {outcome.reason}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2 text-sm">
      <p>
        <span className="font-medium">
          {outcome.matched ? 'This would fire.' : 'This would not fire.'}
        </span>{' '}
        {/* Both numbers, always. A score without its threshold cannot be
            acted on, and a miss at 0.68 against 0.7 is a different decision
            from a miss at 0.05. */}
        Scored {outcome.score.toFixed(2)} against a threshold of{' '}
        {outcome.threshold.toFixed(2)}.
      </p>

      {outcome.masked ? (
        <div className="text-xs text-muted-foreground">
          {/* Shown rather than explained. The caveat under the policy field
              says the judge reads masked text; this is what that looks like
              for the message they just pasted, which is the difference
              between a sentence and something they act on. */}
          <p className="font-medium">What the judge actually read:</p>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2">
            {outcome.judgedText}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
