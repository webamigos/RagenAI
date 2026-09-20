/**
 * How long a resolved rule set is reused, and how long a failed load is
 * remembered.
 *
 * In the package because both runtimes need the same answer and each had its
 * own copy: `apps/web` exported `GUARDRAIL_CACHE_TTL_MS` and `apps/api`
 * declared a private `CACHE_TTL_MS`, both 60_000. Two copies of a number the
 * documentation promises in four places — and drift would make the
 * break-glass guidance ("disabling the rule takes effect within the 60 s
 * cache") true on one surface and false on the other, which is worse than
 * either value being wrong.
 *
 * `a-documented-window-matches-its-constant` reads the stated seconds out of
 * the spec and holds these to them, so changing one without the other fails
 * and says which to update.
 */

/**
 * The window an operator is promised.
 *
 * It does two jobs, and both are why it is not shorter. It bounds how stale a
 * panel change may be — a rule switched on applies within a minute, a rule
 * switched off stops applying within a minute, and the runbook quotes that.
 * And it is the mitigation for a Postgres blip: with a warm entry, a database
 * that is briefly unreachable never reaches the turn at all.
 */
export const GUARDRAIL_CACHE_TTL_MS = 60_000;

/**
 * How long a *failed* load is remembered, so an outage costs one query per
 * organization per interval instead of one per turn.
 *
 * Short on purpose, and for the opposite reason to the window above: this is
 * the interval in which guardrails are not enforced, so it is measured in
 * seconds. Without it the fail-open path pays a connection timeout on every
 * turn, which turns a degraded database into a degraded chat.
 */
export const GUARDRAIL_FAILURE_TTL_MS = 5_000;
