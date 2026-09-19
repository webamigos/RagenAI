import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockBullStart } = vi.hoisted(() => ({
  mockBullStart: vi.fn(),
}));

/**
 * The adapters are stubbed; the seam is not.
 *
 * What this module does is two lines of registration, and the way it fails is
 * silent: nothing here throws until a producer calls `jobs()` in production
 * and gets "no adapter registered for WORKER_RUNTIME". So the test exercises
 * the real resolution path and stubs only the engines underneath it.
 *
 * **BullMQ alone, since G3.** This file used to stub both adapters — Temporal
 * first, then both, because stubbing Temporal alone worked only while Temporal
 * was the default and the flip to BullMQ left this opening a real connection.
 * There is one adapter to stub now: `@ragenai/jobs-temporal` moved to
 * `webamigos/ragen-enterprise` and this application no longer registers it.
 * **What a Temporal deployment now gets from this build is asserted in
 * `packages/jobs`, not here.** An unmodified `apps/web` set to
 * `WORKER_RUNTIME=temporal` throws the seam's *no adapter registered* on the
 * first enqueue — the loud failure, rather than a queue nobody reads — and
 * that case lives in `runtime.test.ts` because `getJobRuntime` caches inside
 * `@ragenai/jobs`, which vitest externalises: `vi.resetModules()` here returns
 * a fresh copy of this module and the same already-resolved runtime.
 */
vi.mock('@ragenai/jobs-bullmq', () => ({
  // `new BullMqJobRuntime()` — an arrow has no [[Construct]].
  BullMqJobRuntime: vi.fn(function () {
    return { start: mockBullStart };
  }),
}));

import { jobs } from '../index';

describe('apps/web job runtime', () => {
  /**
   * The suite decides the runtime, not the shell it runs in.
   *
   * A developer or a CI runner with `WORKER_RUNTIME=temporal` exported would
   * otherwise fail the default-runtime case below while runtime selection is
   * working perfectly — the same environment coupling that made the Node
   * version leak into `create-ragen-app`'s suite.
   */
  const originalRuntime = process.env.WORKER_RUNTIME;

  beforeEach(() => {
    delete process.env.WORKER_RUNTIME;
    mockBullStart.mockReset().mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalRuntime === undefined) {
      delete process.env.WORKER_RUNTIME;
    } else {
      process.env.WORKER_RUNTIME = originalRuntime;
    }
  });

  it('resolves an adapter for the runtime this deployment is configured for', () => {
    expect(() => jobs()).not.toThrow();
  });

  it('reaches the adapter when a producer starts a job', async () => {
    await jobs().start('scrapeWebsite', 'web-1', {
      url: 'https://example.com',
      mode: 'scrape',
      orgId: 'org-1',
      projectId: null,
    });

    // An unset runtime is BullMQ (ADR-44).
    expect(mockBullStart).toHaveBeenCalledWith('scrapeWebsite', 'web-1', {
      url: 'https://example.com',
      mode: 'scrape',
      orgId: 'org-1',
      projectId: null,
    });
  });

  it('builds the runtime once, because a producer calls jobs() per request', () => {
    expect(jobs()).toBe(jobs());
  });
});
