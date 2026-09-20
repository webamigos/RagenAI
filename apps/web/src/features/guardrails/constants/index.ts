/**
 * How long a resolved rule set is reused for one organization.
 *
 * The number the spec names, and it is doing two jobs. It bounds how stale a
 * panel change may be — an operator switching a rule off sees it take effect
 * within a minute, which is the promise the break-glass documentation makes —
 * and it is the mitigation for a Postgres blip: with a warm entry, a database
 * that is briefly unreachable never reaches the turn at all.
 */
export const GUARDRAIL_CACHE_TTL_MS = 60_000;

/**
 * How long a *failed* load is remembered, so an outage costs one query per
 * organization per interval instead of one per turn.
 *
 * Not in the spec, and a deliberate addition. The fail-open path is correct but
 * not free: without this, every turn during a Postgres outage pays a connection
 * timeout before falling back, which turns a degraded database into a degraded
 * chat. Short on purpose — this is the window in which guardrails are not
 * enforced, so it is measured in seconds, not the minute a successful load
 * gets.
 */
export const GUARDRAIL_FAILURE_TTL_MS = 5_000;
