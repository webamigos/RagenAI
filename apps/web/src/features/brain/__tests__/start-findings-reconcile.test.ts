import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('@/libs/jobs', () => ({ jobs: () => runtime }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@/app/lib/utils/logger', () => ({ logger: log }));

const { startFindingsReconcile } =
  await import('../services/commands/start-findings-reconcile');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startFindingsReconcile', () => {
  it('starts the job by name, for the organization, under a fresh run id', async () => {
    await startFindingsReconcile('org-1');
    await startFindingsReconcile('org-1');
    expect(runtime.start).toHaveBeenCalledTimes(2);
    const [[job, first, payload], [, second]] = runtime.start.mock.calls;
    expect(job).toBe('brainReconcileFindings');
    expect(payload).toEqual({ orgId: 'org-1' });
    expect(first).toMatch(/^brain-reconcile-/);
    expect(second).not.toBe(first);
  });

  it('logs a failed enqueue instead of failing the decision it follows', async () => {
    runtime.start.mockRejectedValue(new Error('redis down'));
    await expect(startFindingsReconcile('org-1')).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      { orgId: 'org-1', error: 'redis down' },
      expect.any(String),
    );
  });
});
