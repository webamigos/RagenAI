import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockBullStart, mockTemporalStart } = vi.hoisted(() => ({
  mockBullStart: vi.fn(),
  mockTemporalStart: vi.fn(),
}));

/**
 * The adapters are stubbed; the seam is not.
 *
 * What this module does is two lines of registration, and the way it fails is
 * silent: nothing here throws until a producer calls `jobs()` in production
 * and gets "no adapter registered for WORKER_RUNTIME". So the test exercises
 * the real resolution path and stubs only the engines underneath it.
 *
 * **Both, since ADR-44.** Stubbing Temporal alone worked only while Temporal
 * was the default; the flip to BullMQ left this constructing a real
 * `BullMqJobRuntime` and opening a connection, which fails as a mock
 * assertion on a machine with Redis running and as a timeout without one. A
 * test that leans on the default is asserting the default.
 */
vi.mock('@ragenai/jobs-bullmq', () => ({
  // `new BullMqJobRuntime()` — an arrow has no [[Construct]].
  BullMqJobRuntime: vi.fn(function () {
    return { start: mockBullStart };
  }),
}));

vi.mock('@ragenai/jobs-temporal', () => ({
  TemporalJobRuntime: vi.fn(function () {
    return { start: mockTemporalStart };
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
    mockTemporalStart.mockReset().mockResolvedValue(undefined);
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
    expect(mockTemporalStart).not.toHaveBeenCalled();
  });

  it('builds the runtime once, because a producer calls jobs() per request', () => {
    expect(jobs()).toBe(jobs());
  });
});
