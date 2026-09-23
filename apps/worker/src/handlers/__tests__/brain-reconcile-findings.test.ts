import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import { createMockActivities } from '../../__tests__/fixtures/mock-activities.js';
import { brainReconcileFindings } from '../brain-reconcile-findings.js';

function context(activities: ReturnType<typeof createMockActivities>) {
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return ctx;
}

describe('brainReconcileFindings', () => {
  it('does nothing when the organization has Brain off at run time', async () => {
    const activities = createMockActivities();
    activities.startBrainExtractRun.mockResolvedValue({
      enabled: false,
      maxDocuments: 10,
      maxTokens: 1e6,
    });
    const result = await brainReconcileFindings(
      { orgId: 'org-1' },
      context(activities),
    );
    expect(result).toEqual({
      skipped: 'disabled',
      created: 0,
      updated: 0,
      resolved: 0,
    });
    expect(activities.reconcileBrainFindings).not.toHaveBeenCalled();
  });

  it('reconciles the organization it was given and reports what it wrote', async () => {
    const activities = createMockActivities();
    activities.startBrainExtractRun.mockResolvedValue({
      enabled: true,
      maxDocuments: 10,
      maxTokens: 1e6,
    });
    activities.reconcileBrainFindings.mockResolvedValue({
      created: 1,
      updated: 0,
      resolved: 2,
      holding: 5,
    });
    const result = await brainReconcileFindings(
      { orgId: 'org-9' },
      context(activities),
    );
    expect(activities.reconcileBrainFindings).toHaveBeenCalledWith({
      orgId: 'org-9',
    });
    expect(result).toEqual({
      skipped: null,
      created: 1,
      updated: 0,
      resolved: 2,
    });
  });
});
