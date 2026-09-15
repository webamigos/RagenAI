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
export interface RetryPolicy {
  /** Temporal's duration strings — '1 second', '2 minutes'. */
  initialInterval: string;
  maximumInterval: string;
  backoffCoefficient: number;
  maximumAttempts: number;
}
export interface StepOptions {
  retry: RetryPolicy;
  /** How long one attempt may run before it is abandoned. */
  startToCloseTimeout: string;
}
/**
 * Parse one of Temporal's duration strings into milliseconds.
 *
 * Throws rather than defaulting, because every caller is a constant written in
 * this repository: a string this cannot read is a typo in a policy, and a
 * silent fallback would apply a timeout nobody chose.
 */
export declare function durationMs(duration: string): number;
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
export declare function backoffMs(policy: RetryPolicy, attempt: number): number;
//# sourceMappingURL=retry.d.ts.map
