/**
 * The retry and timeout semantics both runtimes read from one options object.
 *
 * Temporal takes these values as they are — `proxyActivities` accepts the same
 * shape — so on that side this file is a type and nothing else. BullMQ has no
 * equivalent of a per-activity policy, so the adapter implements it, and it has
 * to implement *these* numbers rather than its own: a step that retried five
 * times over a minute under one engine and twice under the other would be a
 * behaviour change disguised as a port.
 */

/**
 * Every field is optional, because the policies in this repository are.
 * `generateDocument`'s upload step is `{ maximumAttempts: 1 }` and nothing
 * else — a Drive upload that failed once should surface, not be retried — and
 * Temporal fills the rest from its own defaults. `backoffMs` fills them from
 * the same numbers, so "unspecified" means the same thing to both engines
 * instead of meaning "zero" to one of them.
 */
export interface RetryPolicy {
  /** Temporal's duration strings — '1 second', '2 minutes'. */
  initialInterval?: string;
  maximumInterval?: string;
  backoffCoefficient?: number;
  maximumAttempts?: number;
}

/** Temporal's own defaults, which an unspecified field inherits. */
export const RETRY_DEFAULTS = {
  initialInterval: '1 second',
  backoffCoefficient: 2,
  /** Temporal caps at 100× the initial interval when none is given. */
  maximumIntervalMultiplier: 100,
} as const;

export interface StepOptions {
  retry: RetryPolicy;
  /** How long one attempt may run before it is abandoned. */
  startToCloseTimeout: string;
}

const UNITS: Record<string, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
};

/**
 * Parse one of Temporal's duration strings into milliseconds.
 *
 * Throws rather than defaulting, because every caller is a constant written in
 * this repository: a string this cannot read is a typo in a policy, and a
 * silent fallback would apply a timeout nobody chose.
 */
export function durationMs(duration: string): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]+)\s*$/i.exec(duration);
  const unit = match ? UNITS[match[2].toLowerCase()] : undefined;

  if (!match || unit === undefined) {
    throw new Error(
      `unreadable duration "${duration}" — expected a value and a unit, e.g. "30 seconds"`,
    );
  }

  return Number(match[1]) * unit;
}

/**
 * How long to wait before attempt `attempt` (1-based), in milliseconds.
 *
 * Exponential from `initialInterval`, capped at `maximumInterval` — the same
 * curve Temporal applies, so a step behaves the same under either engine for as
 * long as the process stays up. What differs is durability, not timing: a crash
 * mid-backoff loses this state on BullMQ and the whole job is redelivered. The
 * spec says so under *What we lose*, and it is the reason activity idempotency
 * is load-bearing rather than tidy.
 */
export function backoffMs(policy: RetryPolicy, attempt: number): number {
  const initial = durationMs(
    policy.initialInterval ?? RETRY_DEFAULTS.initialInterval,
  );
  const maximum = policy.maximumInterval
    ? durationMs(policy.maximumInterval)
    : initial * RETRY_DEFAULTS.maximumIntervalMultiplier;
  const coefficient =
    policy.backoffCoefficient ?? RETRY_DEFAULTS.backoffCoefficient;
  const grown = initial * coefficient ** Math.max(0, attempt - 1);

  return Math.min(grown, maximum);
}
