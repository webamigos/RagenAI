import type { GuardrailHitCounts } from '../hit-window';

/**
 * What a rule did lately, in the one place an operator decides whether to
 * promote it.
 *
 * Three states, and the difference between the last two is the whole point of
 * the column: a rule with hits reports them whether or not it is switched on
 * now — it may have been on for part of the window, and hiding that would lose
 * the only evidence there is. A rule that is on and has none says `0`, which
 * is a measurement. A rule that is off says nothing, because a rule nothing
 * evaluated has not been measured, and `0` would claim it had.
 *
 * Its own file rather than a helper inside the table, because that
 * distinction is real logic and the table cannot be rendered in a test
 * without standing up the Server Actions it calls.
 */
export function HitCounts({
  counts,
  enabled,
}: {
  counts: GuardrailHitCounts | undefined;
  enabled: boolean;
}) {
  const blocked = counts?.blocked ?? 0;
  const flagged = counts?.flagged ?? 0;

  if (blocked === 0 && flagged === 0) {
    return enabled ? (
      <span className="text-xs">0</span>
    ) : (
      <span className="text-xs" title="Switched off — nothing evaluated it">
        —
      </span>
    );
  }

  return (
    <div className="text-xs">
      {blocked > 0 ? (
        <div className="font-medium">{blocked} blocked</div>
      ) : null}
      {flagged > 0 ? <div>{flagged} flagged</div> : null}
      {enabled ? null : (
        <div className="mt-0.5 text-muted-foreground">
          Switched off since — these are from earlier in the window.
        </div>
      )}
    </div>
  );
}
