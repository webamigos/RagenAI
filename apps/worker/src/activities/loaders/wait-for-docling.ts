import { db } from '../../services/db/index.js';
import { isDoclingUp } from '../../services/docling-health.js';
import { logger } from '../../services/logger.js';
import {
  DOCLING_OUTAGE_MAX_WAIT_MS,
  doclingGateDelayMs,
} from '../../utils/docling-gate.js';

export type DoclingGateOutcome =
  | { outcome: 'available'; waitedMs: number }
  | { outcome: 'cancelled'; waitedMs: number }
  | { outcome: 'timed-out'; waitedMs: number; since: string };

type Dependencies = {
  isUp: () => Promise<boolean>;
  isCancelled: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  maxWaitMs: number;
};

/**
 * Wait until Docling answers its health check, the ingest is cancelled, or
 * the outage outlasts `maxWaitMs` — whichever comes first. Never throws for
 * an outage: that is the whole point. The strict step policy's attempts are
 * for a Docling that is up and failing, and spending them on one that is
 * restarting is how a restart used to fail a whole upload.
 *
 * Cancellation is read between looks, so a person who gives up on a file is
 * not kept waiting half an hour for the wait to notice.
 */
export async function waitForDoclingWith(
  deps: Dependencies,
): Promise<DoclingGateOutcome> {
  const started = deps.now();
  for (let check = 0; ; check++) {
    if (await deps.isUp()) {
      return { outcome: 'available', waitedMs: deps.now() - started };
    }
    if (await deps.isCancelled()) {
      return { outcome: 'cancelled', waitedMs: deps.now() - started };
    }
    const waited = deps.now() - started;
    if (waited >= deps.maxWaitMs) {
      return {
        outcome: 'timed-out',
        waitedMs: waited,
        since: new Date(started).toISOString(),
      };
    }
    await deps.sleep(
      Math.min(doclingGateDelayMs(check), deps.maxWaitMs - waited),
    );
  }
}

/**
 * The step `parse-and-embed` runs before a strict Docling parse (spec
 * 2026-09-26-docling-under-load, B1). A worker slot is held while it waits,
 * and that is intended: with `DOCLING_MAX_CONCURRENCY` the slots are the
 * backpressure, so a few files wait here and the rest stay queued in Redis.
 */
export async function waitForDocling({
  fileId,
  orgId,
}: {
  fileId: string;
  orgId: string;
}): Promise<DoclingGateOutcome> {
  let warned = false;
  return await waitForDoclingWith({
    isUp: async () => {
      const up = await isDoclingUp();
      if (!up && !warned) {
        warned = true;
        logger.warn(
          { fileId, orgId },
          'Docling is unavailable; the ingest waits for it rather than spending its attempts',
        );
      }
      return up;
    },
    isCancelled: () => db.isIngestCancelled(fileId, orgId),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
    maxWaitMs: DOCLING_OUTAGE_MAX_WAIT_MS,
  });
}
