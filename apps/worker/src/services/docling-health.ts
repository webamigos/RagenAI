import { isDoclingAvailable } from './docling-client.js';

/**
 * Docling's `/health`, remembered for a few seconds across the process (spec
 * 2026-09-26-docling-under-load, B1).
 *
 * Every ingest waiting on the same Docling asks the same question, and with
 * `DOCLING_MAX_CONCURRENCY` of them in flight a check per job per pause would
 * be several requests a second at a service that is, by assumption, already
 * in trouble. One answer serves them all until it is `ttlMs` old. Down is
 * remembered as long as up: a flapping Docling should not be probed harder.
 */
export function cachedDoclingHealth({
  check = isDoclingAvailable,
  ttlMs = 5_000,
  now = Date.now,
}: {
  check?: () => Promise<boolean>;
  ttlMs?: number;
  now?: () => number;
} = {}): () => Promise<boolean> {
  let last: { up: boolean; at: number } | null = null;
  let pending: Promise<boolean> | null = null;

  return async () => {
    if (last && now() - last.at < ttlMs) {
      return last.up;
    }
    // Concurrent askers share the one request in flight.
    pending ??= check()
      .catch(() => false)
      .then((up) => {
        last = { up, at: now() };
        pending = null;
        return up;
      });
    return pending;
  };
}

/** The process-wide instance the waiting step uses. */
export const isDoclingUp = cachedDoclingHealth();
