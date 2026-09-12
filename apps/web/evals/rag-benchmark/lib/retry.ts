/**
 * Retry a transient failure.
 *
 * One `fetch failed` against the proxy cost a whole case in the first run, and
 * a benchmark whose number moves because a socket dropped is not a benchmark.
 * Only the call is retried — grading is pure and deterministic, so it has
 * nothing to retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    attempts?: number;
    delayMs?: number;
    onRetry?: (attempt: number, err: unknown) => void;
  } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 2_000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        opts.onRetry?.(attempt, err);
        // Linear, not exponential: the failures worth retrying here are a
        // dropped socket or a proxy still warming up, both of which clear in
        // seconds. A long backoff would only stretch a 24-question run.
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}
