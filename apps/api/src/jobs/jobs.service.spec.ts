// `vi.mock` is hoisted above these declarations, so they travel up with it.
// jest exempted names beginning with `mock`; vitest has no such exemption.
const { mockStart } = vi.hoisted(() => ({ mockStart: vi.fn() }));

/**
 * The adapter is stubbed; the seam is not.
 *
 * Mocking `@ragenai/jobs` instead would have left this test asserting that a
 * mock calls a mock — and the thing worth checking here is the wiring itself:
 * that importing the service registers an adapter under the runtime name
 * `getJobRuntime()` resolves to, and that `start` reaches it. That is the
 * whole of what this five-line binding does, and it fails silently when it
 * breaks.
 */
vi.mock('@ragenai/jobs-temporal', () => ({
  // `new TemporalJobRuntime()` — an arrow has no [[Construct]].
  TemporalJobRuntime: vi.fn(function () {
    return { start: mockStart };
  }),
}));

import { TemporalJobRuntime } from '@ragenai/jobs-temporal';
import { JobsService } from './jobs.service.js';
import { Workflow } from './jobs.consts.js';

describe('JobsService', () => {
  let service: JobsService;

  beforeEach(() => {
    mockStart.mockReset().mockResolvedValue(undefined);
    service = new JobsService();
  });

  it('starts the job through the runtime registered for this deployment', async () => {
    await service.start(Workflow.RUN_FILE_EMBEDDINGS, 'doc-abc', {
      id: 'file-1',
    } as never);

    expect(TemporalJobRuntime).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledWith('runFileEmbeddings', 'doc-abc', {
      id: 'file-1',
    });
  });

  it('propagates a failure to start, because the caller rolls back on it', async () => {
    mockStart.mockRejectedValue(new Error('temporal down'));

    await expect(
      service.start(Workflow.RUN_FILE_EMBEDDINGS, 'doc-abc', {} as never),
    ).rejects.toThrow('temporal down');
  });
});
