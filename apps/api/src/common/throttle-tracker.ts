import { type SessionAuthContext } from './types/session-auth-context.js';

const BEARER_PREFIX = 'Bearer ';

type TrackedRequest = {
  ip?: string;
  ips?: string[];
  headers?: Record<string, string | string[] | undefined>;
};

/**
 * Whom a request counts against in the rate limiter.
 *
 * The throttler's default is the client IP. Every `/v1/internal/*` call
 * comes from apps/web's server, though — one IP for every signed-in person —
 * so the whole organization shared one bucket: on demo the notifications
 * page answered 429 for everyone once a handful of people had it open, and
 * so would the thread list and every other internal read.
 *
 * A request carrying a session token apps/web signed (the one
 * `SessionAuthGuard` checks) counts against the **person** it vouches for.
 * Anything else — a public API key, a bad or expired token, no token — keeps
 * counting against its IP, so a forged header buys nothing: without a valid
 * signature it is an IP like any other.
 */
export function throttleTracker(
  req: TrackedRequest,
  verify: (token: string) => SessionAuthContext | null,
): string {
  const header = req.headers?.authorization;
  const auth = Array.isArray(header) ? header[0] : header;
  if (auth?.startsWith(BEARER_PREFIX)) {
    const context = verify(auth.slice(BEARER_PREFIX.length));
    if (context) {
      return `user:${context.userId}`;
    }
  }
  return req.ips?.length ? req.ips[0] : (req.ip ?? 'unknown');
}
