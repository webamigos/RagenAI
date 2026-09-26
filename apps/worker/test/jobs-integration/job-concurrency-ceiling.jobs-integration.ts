import { resolveWorkerRuntime } from '@ragenai/jobs';
import {
  closeBullWorkers,
  createBullWorkers,
  startBullWorkers,
  type BullWorkers,
} from '@ragenai/jobs-bullmq';
import { afterEach, describe, expect, it } from 'vitest';

import { TEST_REDIS_URL } from './harness-bullmq.js';
import {
  pollUntilTerminal,
  sleep,
  startHarness,
  testLogger,
  type JobRuntimeHarness,
} from './harness.js';

/**
 * A `jobConcurrency` ceiling holds across replicas, against a real Redis.
 *
 * The unit suite proves `startBullWorkers` sets BullMQ's global concurrency on
 * the queue before a worker runs. Only a real queue proves the setting does
 * what it is for: two replicas, each allowed twenty jobs, run **one** Brain
 * extraction at a time between them. Vertex answered 429 at two.
 *
 * BullMQ's alone. The Temporal adapter lives in `ragen-enterprise` and has no
 * `jobConcurrency`; a Temporal deployment limits this with the task queue's
 * own rate settings.
 */
describe.runIf(resolveWorkerRuntime() === 'bullmq')(
  'a per-job concurrency ceiling',
  () => {
    let harness: JobRuntimeHarness | undefined;
    const replicas: BullWorkers[] = [];

    afterEach(async () => {
      for (const workers of replicas.splice(0)) {
        await closeBullWorkers(workers);
      }
      await harness?.close();
      harness = undefined;
    });

    /**
     * Run `jobs` jobs of one name over two replicas, each allowed twenty, with
     * a deployment-wide `ceiling`; report the most that ran at once.
     */
    async function peakAcrossTwoReplicas(
      ceiling: number,
      jobs: number,
      job: 'brainExtract' | 'runFileEmbeddings' = 'brainExtract',
    ) {
      // Paused: the harness's own workers must not take these jobs.
      harness = await startHarness({ consume: false });

      let active = 0;
      let peak = 0;
      const handler = async () => {
        active += 1;
        peak = Math.max(peak, active);
        await sleep(400);
        active -= 1;
        if (job === 'runFileEmbeddings') {
          return 'indexed';
        }
        return {
          skipped: null,
          extracted: 1,
          failed: 0,
          notAttempted: 0,
          pagesCreated: 0,
          unverifiedClaims: 0,
          tokens: 0,
        };
      };

      for (let replica = 0; replica < 2; replica++) {
        const workers = createBullWorkers({
          handlers: { [job]: handler } as never,
          activities: {},
          connection: { url: TEST_REDIS_URL },
          concurrency: 20,
          jobConcurrency: { [job]: ceiling },
          log: testLogger(),
          isCancelled: async () => false,
        });
        replicas.push(workers);
        await startBullWorkers(workers);
      }

      const runIds = Array.from({ length: jobs }, (_, i) => `${job}-${i}`);
      for (const [i, runId] of runIds.entries()) {
        if (job === 'runFileEmbeddings') {
          await harness.jobs.start('runFileEmbeddings', runId, {
            fileId: `file-${i}`,
            orgId: 'org-1',
          });
        } else {
          await harness.jobs.start('brainExtract', runId, {
            orgId: 'org-1',
            fileIds: ['file-1'],
          });
        }
      }
      for (const runId of runIds) {
        expect(await pollUntilTerminal(harness.jobs, runId)).toMatchObject({
          status: 'completed',
        });
      }
      return peak;
    }

    it('runs one extraction at a time across two replicas', async () => {
      expect(await peakAcrossTwoReplicas(1, 4)).toBe(1);
    }, 30_000);

    // The control: without it a test that never ran two at once for some
    // other reason would pass the assertion above for free.
    it('runs several when the ceiling allows them', async () => {
      expect(await peakAcrossTwoReplicas(3, 6)).toBeGreaterThan(1);
    }, 30_000);

    // Spec 2026-09-26-docling-under-load, A1: ingest is the queue Docling
    // sees, so its ceiling is the number of conversions in flight. Two
    // replicas at twenty each, a ceiling of two: never more than two, and
    // (the control) more than one, or the ceiling proved nothing.
    it('holds the ingest ceiling across two replicas', async () => {
      const peak = await peakAcrossTwoReplicas(2, 6, 'runFileEmbeddings');
      expect(peak).toBeLessThanOrEqual(2);
      expect(peak).toBe(2);
    }, 30_000);
  },
);
