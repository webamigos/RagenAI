/**
 * The window the counts cover, and the shape they arrive in.
 *
 * Separate from `hit-counts.ts` for one reason: that file reaches the database
 * and the admin guard, and the guard imports `server-only`. The table that
 * *renders* the counts is a client component, so a client importing the window
 * length from there would break the build — and the obvious way out, writing
 * "7 days" into the heading by hand, is how a label ends up claiming a window
 * the query stopped using.
 */

/** Long enough to cover a working week, short enough to mean "lately". */
export const HIT_WINDOW_DAYS = 7;

export type GuardrailHitCounts = {
  /** `BLOCK` rules: turns that were refused. */
  readonly blocked: number;
  /** `LOG` and `MASK` rules: matched, and the turn went on. */
  readonly flagged: number;
};

/**
 * Keyed by the rule's `publicId`, which is what both recorders write into
 * `metadata.guardrail`. The rule's *name* is in there too and is not used
 * here: a name is editable, so counting on it would split one rule's history
 * in half the day somebody renames it.
 */
export type GuardrailHitsByRule = Record<string, GuardrailHitCounts>;
