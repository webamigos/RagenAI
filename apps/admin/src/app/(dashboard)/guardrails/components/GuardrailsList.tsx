'use client';

import { BUILT_IN_GUARDRAIL_LABELS } from '@ragenai/guardrails/contracts';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  deleteGuardrailAction,
  toggleGuardrailAction,
  type GuardrailRow,
} from '../actions';
import type { GuardrailHitsByRule } from '../hit-window';
import { GuardrailForm } from './GuardrailForm';
import { HitCounts } from './HitCounts';

/**
 * What a rule does when it matches, in words rather than in enum spelling.
 *
 * `LOG` is the one worth a sentence: an operator reading "log" on a security
 * page can reasonably assume it also stops something.
 */
const ACTION_DESCRIPTIONS: Record<string, string> = {
  BLOCK: 'Refuses the turn',
  MASK: 'Replaces the match',
  LOG: 'Records it, turn continues',
};

export function GuardrailsList({
  rules,
  hits,
}: {
  rules: GuardrailRow[];
  hits: GuardrailHitsByRule;
}) {
  const [editing, setEditing] = useState<GuardrailRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GuardrailRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (
    work: () => Promise<{ ok: boolean; message?: string }>,
    success: string,
  ) => {
    startTransition(async () => {
      try {
        const result = await work();
        if (result.ok) {
          toast.success(success);
          setDeleteTarget(null);
        } else {
          // The refusals here explain a design constraint — why a built-in
          // cannot be deleted, why a pattern was rejected — so they are shown
          // rather than replaced with "something went wrong".
          toast.error(result.message ?? 'That did not work.');
        }
      } catch {
        // A refusal comes back as `{ ok: false }`; a Prisma or audit failure
        // rejects, and an uncaught rejection leaves the row looking untouched
        // with no error at all.
        toast.error('That did not work. The server reported a failure.');
      }
    });
  };

  if (rules.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">No platform rules yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          A rule you add here applies to every organization, unless one
          overrides it.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Rule</th>
              <th className="px-4 py-3 font-medium">Matches</th>
              <th className="px-4 py-3 font-medium">On a hit</th>
              <th className="px-4 py-3 font-medium">Hits</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Overrides</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.publicId} className="border-b border-border/60">
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {rule.key
                      ? (BUILT_IN_GUARDRAIL_LABELS[
                          rule.key as keyof typeof BUILT_IN_GUARDRAIL_LABELS
                        ] ?? rule.name)
                      : rule.name}
                  </div>
                  {rule.description ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {rule.description}
                    </div>
                  ) : null}
                  {rule.key ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Built in · {rule.key}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {rule.kind === 'PATTERN' && rule.pattern ? (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {rule.pattern}
                    </code>
                  ) : (
                    <span className="text-xs">{rule.kind}</span>
                  )}
                  <div className="mt-1 text-xs">{rule.stage}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {ACTION_DESCRIPTIONS[rule.action] ?? rule.action}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <HitCounts
                    counts={hits[rule.publicId]}
                    enabled={rule.enabled}
                    overrideCount={rule.overrideCount}
                  />
                </td>
                <td className="px-4 py-3">
                  {/* State is a word, not only a colour: the panel rules ask
                      for that, and a colour-only switch on a security page is
                      the worst place to make somebody guess. */}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () =>
                          toggleGuardrailAction(rule.publicId, !rule.enabled),
                        rule.enabled ? 'Rule switched off' : 'Rule switched on',
                      )
                    }
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    {rule.enabled ? 'On' : 'Off'}
                  </button>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {rule.overrideCount === 0
                    ? '—'
                    : `${rule.overrideCount} organization${rule.overrideCount === 1 ? '' : 's'}`}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(rule)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    Edit
                  </button>
                  {rule.key ? null : (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(rule)}
                      className="ml-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <GuardrailForm rule={editing} onClose={() => setEditing(null)} />
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Delete this rule?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {deleteTarget.name} stops applying to every organization, and any
              override an organization set for it goes with it.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                Keep it
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => deleteGuardrailAction(deleteTarget.publicId),
                    'Rule deleted',
                  )
                }
                className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
