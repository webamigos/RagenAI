import { beforeEach, describe, expect, it, vi } from 'vitest';

const getJobRuntime = vi.fn();

vi.mock('@ragenai/jobs', () => ({
  getJobRuntime: () => getJobRuntime(),
  registerJobRuntime: vi.fn(),
  resolveWorkerRuntime: () => 'bullmq',
  TEMPORAL_ADAPTER_PACKAGE: '@ragenai/jobs-temporal',
}));
vi.mock('@ragenai/jobs-bullmq', () => ({ BullMqJobRuntime: class {} }));

const { closeJobs } = await import('../jobs.js');

// A script that enqueues and never closes the runtime prints its last line
// and does not exit, because the queue's Redis connection keeps the event
// loop alive — `reindex-for-context.ts` hung after its first organization.
describe('closeJobs', () => {
  beforeEach(() => getJobRuntime.mockReset());

  it('closes the runtime the scripts started their jobs on', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    getJobRuntime.mockReturnValue({ close });
    await closeJobs();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for a runtime with nothing to release', async () => {
    getJobRuntime.mockReturnValue({});
    await expect(closeJobs()).resolves.toBeUndefined();
  });
});
