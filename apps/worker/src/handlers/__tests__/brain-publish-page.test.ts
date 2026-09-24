import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import { createMockActivities } from '../../__tests__/fixtures/mock-activities.js';
import { brainPublishPage } from '../brain-publish-page.js';

describe('brainPublishPage', () => {
  it('hands the payload to the publication step and returns its result', async () => {
    const activities = createMockActivities();
    const ctx: JobContext = {
      runId: 'run-1',
      steps: <A>() => activities as unknown as A,
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      progress: vi.fn(),
      checkCancelled: vi.fn().mockResolvedValue(false),
    };
    const payload = { orgId: 'org-1', pageId: 'p', generation: 2 };
    await expect(brainPublishPage(payload, ctx)).resolves.toEqual({
      status: 'published',
      chunks: 1,
    });
    expect(activities.publishKnowledgePage).toHaveBeenCalledWith(payload);
  });
});
