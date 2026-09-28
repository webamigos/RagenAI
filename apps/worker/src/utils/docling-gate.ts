/**
 * How long a strict ingest waits for a Docling that is down before the file
 * fails, and how often it looks (spec 2026-09-26-docling-under-load, B1).
 *
 * Its own module, and one that reads no environment, because two places need
 * the same numbers and one of them runs in Temporal's workflow sandbox, where
 * `consts.ts` cannot load: the step that waits (`waitForDocling`), and the
 * step policy in `parse-and-embed.ts` whose timeout has to outlast the wait.
 * Declared once here, the two cannot drift apart.
 */

/** Past this, the file fails with "parser unavailable since …". */
export const DOCLING_OUTAGE_MAX_WAIT_MS = 30 * 60_000;

/**
 * The waiting step's timeout: the wait, plus room for the last health check
 * and the database reads between checks. A literal string, as the step
 * options take one, and asserted against the wait in its test.
 */
export const DOCLING_GATE_STEP_TIMEOUT = '32 minutes';
export const DOCLING_GATE_STEP_TIMEOUT_MS = 32 * 60_000;

const FIRST_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60_000;

/**
 * The pause before the next look: 5 s, 10 s, 20 s, 40 s, then every minute.
 * Short at first because most outages are a restart; a minute at most so a
 * Docling that comes back is noticed within a minute.
 */
export function doclingGateDelayMs(check: number): number {
  return Math.min(FIRST_DELAY_MS * 2 ** Math.max(check, 0), MAX_DELAY_MS);
}
