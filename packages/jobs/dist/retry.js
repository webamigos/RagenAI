'use strict';
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
Object.defineProperty(exports, '__esModule', { value: true });
exports.durationMs = durationMs;
exports.backoffMs = backoffMs;
const UNITS = {
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
function durationMs(duration) {
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
function backoffMs(policy, attempt) {
  const initial = durationMs(policy.initialInterval);
  const maximum = durationMs(policy.maximumInterval);
  const grown = initial * policy.backoffCoefficient ** Math.max(0, attempt - 1);
  return Math.min(grown, maximum);
}
//# sourceMappingURL=retry.js.map
