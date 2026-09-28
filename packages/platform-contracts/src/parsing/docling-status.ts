/**
 * Docling's health as the worker sees it, published in Redis for apps/web
 * (spec 2026-09-26-docling-under-load, C1 and D5).
 *
 * The worker is the one process that talks to Docling, and the only one that
 * knows its address — `DOCLING_URL` is a worker variable. So the worker
 * probes, and publishes the answer under one key; the setup page and the
 * knowledge base read it. Declared here because two apps must agree on the
 * key and the shape, and a key spelled differently on each side fails with
 * no error: the reader simply never finds anything.
 */

export const DOCLING_STATUS_KEY = 'ragen:docling:status';

/** How often the worker probes. */
export const DOCLING_STATUS_INTERVAL_MS = 30_000;

/**
 * How long a published status lives in Redis. Three probes: long enough to
 * survive one slow probe, short enough that a worker which has stopped does
 * not leave "up" behind it for anyone to trust.
 */
export const DOCLING_STATUS_TTL_SECONDS = 90;

export type DoclingStatus = {
  up: boolean;
  /** When Docling last changed between up and down — "down since 09:15". */
  since: string;
  /** When the worker last looked. */
  checkedAt: string;
};

/**
 * The published status, or `null` when there is none a reader can trust:
 * nothing published (no worker, or not parsing with Docling), a value that
 * is not the shape above, or one older than its TTL — Redis expires it, but
 * a reader should not depend on the one mechanism it cannot see.
 *
 * `null` means "unknown", and a reader must not show it as "up".
 */
export function readDoclingStatus(
  raw: string | null | undefined,
  now: Date = new Date(),
): DoclingStatus | null {
  if (!raw) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { up, since, checkedAt } = value as Record<string, unknown>;
  if (
    typeof up !== 'boolean' ||
    typeof since !== 'string' ||
    typeof checkedAt !== 'string'
  ) {
    return null;
  }
  const checked = Date.parse(checkedAt);
  if (
    Number.isNaN(checked) ||
    now.getTime() - checked > DOCLING_STATUS_TTL_SECONDS * 1000
  ) {
    return null;
  }
  return { up, since, checkedAt };
}
