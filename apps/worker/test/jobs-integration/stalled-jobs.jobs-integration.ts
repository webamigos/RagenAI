import { afterEach, describe, expect, it } from 'vitest';

import { startHarness, type JobRuntimeHarness } from './harness.js';

/**
 * What happens when a job stops renewing its lock.
 *
 * This is the failure mode BullMQ has and Temporal does not, and the one that
 * made `lockDuration: 300_000` and `maxStalledCount: 1` deliberate settings
 * rather than defaults: `sharp`, `resvg`, `pdfium` and `xlsx` all block the
 * event loop, a blocked loop cannot renew a lock, and BullMQ's answer to an
 * unrenewed lock is to **run the job again, in parallel with the first**. Two
 * ingests writing the same file's chunks is exactly the duplication C3 exists
 * to prevent.
 *
 * The lock and sweep are shortened to seconds here (see `CreateWorkersOptions`)
 * because the production numbers mean a five-minute wait per assertion. The
 * behaviour under test is unchanged: a lock that expires, a sweep that notices,
 * and a redelivery budget of one.
 *
 * The handler is a stand-in rather than a pipeline. The subject is the runtime
 * — the pipelines are what the other files run.
 */

const PAYLOAD = { jobId: 'opt-1', documentId: 'doc-1', orgId: 'org-1' };

/** Hold the event loop, the way a synchronous CPU-bound activity does. */
function blockEventLoop(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // Intentionally spinning: `await sleep()` would yield, and a yielding job
    // renews its lock perfectly well. That is the point — only a blocked loop
    // stalls.
  }
}

describe('stalled jobs', () => {
  let harness: JobRuntimeHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('redelivers a job whose lock expired, and the second run finishes it', async () => {
    let attempts = 0;

    harness = await startHarness({
      lockDuration: 1_000,
      stalledInterval: 1_000,
      handlerOverrides: {
        optimizeDocument: async () => {
          attempts += 1;
          if (attempts === 1) {
            // Longer than the lock. The renewal timer never gets a turn.
            blockEventLoop(3_000);
          }
        },
      },
    });

    await harness.jobs.start('optimizeDocument', 'stalled-1', PAYLOAD);
    const run = await harness.waitForRun('stalled-1', 60_000);

    expect(run.status).toBe('completed');
    // Twice: the stalled first attempt and the redelivery that finished it.
    // This is why every activity has to be idempotent — the work before the
    // block is done again, and nothing replays past it.
    expect(attempts).toBe(2);
  });

  it('gives up after one redelivery rather than looping forever', async () => {
    let attempts = 0;

    harness = await startHarness({
      lockDuration: 1_000,
      stalledInterval: 1_000,
      handlerOverrides: {
        optimizeDocument: async () => {
          attempts += 1;
          blockEventLoop(3_000);
        },
      },
    });

    await harness.jobs.start('optimizeDocument', 'stalled-2', PAYLOAD);
    const run = await harness.waitForRun('stalled-2', 60_000);

    // `maxStalledCount: 1`, asserted as behaviour rather than as a constant.
    // A job that stalls twice is blocking the loop, and running it a third
    // time multiplies the damage instead of clearing it.
    expect(run.status).toBe('failed');
    expect(run.failure).toMatch(/stalled/i);
    expect(attempts).toBe(2);
  });
});
