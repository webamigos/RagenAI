/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * The job-runtime integration suite — real queues, real redelivery, real
 * clocks. The spec's D1, and the gate for the BullMQ port: no e2e test can be
 * one, because `e2e.yml` starts no worker and ignores `apps/worker/**`.
 *
 * Separate from `vitest.config.ts` for the same reason the Presidio suite is:
 * `npm test` must not need a container. Run it with a Redis up —
 * `npm run ragen:up:full` locally, a service container in CI — via
 * `npm run test:jobs-integration`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    /**
     * Which runtime is under test.
     *
     * The seam's own default is `temporal`, correct for an application whose
     * deployments have not switched yet and wrong for this suite, whose whole
     * subject is the other adapter. Set here rather than in the harness so the
     * nightly parity job of §8.3 selects Temporal the same way a deployment
     * does — `WORKER_RUNTIME=temporal npm run test:jobs-integration` — instead
     * of through a flag only the tests know about.
     */
    env: { WORKER_RUNTIME: process.env.WORKER_RUNTIME ?? 'bullmq' },
    /**
     * Starts the Temporal server for a parity run, and nothing at all for a
     * BullMQ one — Redis is a container the developer or the CI job already
     * has, while Temporal is no longer in `docker-compose.yml` (E2) and has to
     * come from somewhere.
     */
    globalSetup: ['./test/jobs-integration/global-setup.ts'],
    include: ['test/jobs-integration/**/*.jobs-integration.ts'],
    exclude: ['**/node_modules/**', 'dist/**', 'lib/**', 'generated/**'],
    clearMocks: false,
    /**
     * One file at a time, and one process.
     *
     * Every harness flushes the Redis database it is handed, and the queue
     * names are fixed by the contract rather than generated per run — so two
     * files in parallel would delete each other's jobs and fail in whichever
     * order the scheduler picked. The stalled suite additionally blocks the
     * event loop on purpose, which would stall a neighbouring file's jobs too.
     */
    fileParallelism: false,
    /**
     * Generous, and deliberately so: these tests wait on retry backoffs the
     * handlers actually declare (two seconds and up) and on BullMQ's stalled
     * sweep. A tight timeout here would not catch a slow runtime, it would
     * make the suite flaky on a loaded runner.
     */
    testTimeout: 90_000,
    hookTimeout: 60_000,
  },
});
