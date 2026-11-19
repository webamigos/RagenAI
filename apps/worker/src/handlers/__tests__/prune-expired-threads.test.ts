import type { JobContext, StepOptions } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import { createMockActivities } from '../../__tests__/fixtures/mock-activities.js';
import { pruneExpiredThreads } from '../prune-expired-threads.js';

function context(activities: ReturnType<typeof createMockActivities>) {
  const steps = vi.fn((_options: StepOptions) => activities);
  const ctx: JobContext = {
    runId: 'run-1',
    steps: steps as unknown as JobContext['steps'],
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return { ctx, steps };
}

describe('pruneExpiredThreads (handler)', () => {
  it('runs the retention activity once and returns its counts', async () => {
    const activities = createMockActivities();
    const counts = {
      organizationsWithRetention: 2,
      threadsDeleted: 7,
      messagesDeleted: 31,
      organizationsFailed: 0,
      organizationsCapped: 0,
    };
    activities.pruneExpiredThreads.mockResolvedValue(counts);
    const { ctx } = context(activities);

    await expect(pruneExpiredThreads(undefined, ctx)).resolves.toEqual(counts);
    expect(activities.pruneExpiredThreads).toHaveBeenCalledTimes(1);
    expect(ctx.log.info).toHaveBeenCalledWith(
      'Thread retention finished',
      counts,
    );
  });

  // Retries belong to the step, and a nightly delete gets a few, not hours'
  // worth: the next run is the better recovery.
  it('gives the step a bounded retry policy', async () => {
    const activities = createMockActivities();
    const { ctx, steps } = context(activities);

    await pruneExpiredThreads(undefined, ctx);

    expect(steps.mock.calls[0]?.[0]).toMatchObject({
      retry: { maximumAttempts: 3 },
      startToCloseTimeout: '60 minutes',
    });
  });
});
