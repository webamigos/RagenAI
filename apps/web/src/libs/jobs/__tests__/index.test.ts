import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockStart } = vi.hoisted(() => ({ mockStart: vi.fn() }));

/**
 * The adapter is stubbed; the seam is not.
 *
 * What this module does is one line of registration, and the way it fails is
 * silent: nothing here throws until a producer calls `jobs()` in production
 * and gets "no adapter registered for WORKER_RUNTIME". So the test exercises
 * the real resolution path and stubs only the engine underneath it.
 */
vi.mock('@ragenai/jobs-temporal', () => ({
  // `new TemporalJobRuntime()` — an arrow has no [[Construct]].
  TemporalJobRuntime: vi.fn(function () {
    return { start: mockStart };
  }),
}));

import { jobs } from '../index';

describe('apps/web job runtime', () => {
  beforeEach(() => {
    mockStart.mockReset().mockResolvedValue(undefined);
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

    expect(mockStart).toHaveBeenCalledWith('scrapeWebsite', 'web-1', {
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
