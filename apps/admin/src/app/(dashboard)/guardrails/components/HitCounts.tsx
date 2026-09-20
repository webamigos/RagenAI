import type { GuardrailHitCounts } from '../hit-window';

/**
 * What a rule did lately, in the one place an operator decides whether to
 * promote it.
 *
 * The counts are an aggregate over every organization, and this page lists
 * *platform* rules — so `enabled` here is the platform default, not what any
 * one organization is subject to. An override can switch a platform rule on
 * for an organization that the platform has it off for (`resolve.ts` sets
 * `enabled` from the override whenever it is not null), and hits recorded that
 * way carry this same rule's id.
 *
 * That is why the empty state is not simply "off → nothing to say". Read from
 * `enabled` alone it claimed two things that can both be false: that a
 * switched-off rule was evaluated by nobody, and that hits against one are
 * necessarily historical. `overrideCount` is what makes the claim provable —
 * with no override rows there is no layer that could have turned it on, so the
 * platform default *is* the effective state everywhere.
 *
 * The distinction is worth keeping rather than flattening to a number: `0` on
 * a rule nothing ever evaluated reads as "measured, no false positives", and
 * that is the reading an operator promotes a rule to `BLOCK` on.
 */
export function HitCounts({
  counts,
  enabled,
  overrideCount,
}: {
  counts: GuardrailHitCounts | undefined;
  /** The platform default, which an override can contradict per organization. */
  enabled: boolean;
  /** How many organizations have set an override on this rule. */
  overrideCount: number;
}) {
  const blocked = counts?.blocked ?? 0;
  const flagged = counts?.flagged ?? 0;

  // No override row exists, so no organization can be running it against the
  // platform default. Only here is the default the whole story.
  const offEverywhere = !enabled && overrideCount === 0;

  if (blocked === 0 && flagged === 0) {
    return offEverywhere ? (
      <span className="text-xs" title="Switched off — nothing evaluated it">
        —
      </span>
    ) : (
      <span className="text-xs">0</span>
    );
  }

  return (
    <div className="text-xs">
      {blocked > 0 ? (
        <div className="font-medium">{blocked} blocked</div>
      ) : null}
      {flagged > 0 ? <div>{flagged} flagged</div> : null}
      {offEverywhere ? (
        <div className="mt-0.5 text-muted-foreground">
          Switched off since — these are from earlier in the window.
        </div>
      ) : null}
      {!enabled && overrideCount > 0 ? (
        // Deliberately not "from earlier": an organization overriding it on is
        // recording hits now, under this same rule id.
        <div className="mt-0.5 text-muted-foreground">
          Off by default; some organizations override it.
        </div>
      ) : null}
    </div>
  );
}
