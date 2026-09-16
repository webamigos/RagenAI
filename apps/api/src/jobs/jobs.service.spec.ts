// `vi.mock` is hoisted above these declarations, so they travel up with it.
// jest exempted names beginning with `mock`; vitest has no such exemption.
const { mockBullStart, mockTemporalStart } = vi.hoisted(() => ({
  mockBullStart: vi.fn(),
  mockTemporalStart: vi.fn(),
}));

/**
 * Both adapters are stubbed; the seam is not.
 *
 * Mocking `@ragenai/jobs` instead would have left this test asserting that a
 * mock calls a mock — and the thing worth checking here is the wiring itself:
 * that importing the service registers an adapter under the runtime name
 * `getJobRuntime()` resolves to, and that `start` reaches it. That is the
 * whole of what this five-line binding does, and it fails silently when it
 * breaks.
 *
 * **Both, since ADR-44.** The suite used to stub Temporal alone and lean on it
 * being the default, so the flip to BullMQ turned a wiring test into a real
 * `Queue` opening a real connection: locally that reached a developer's Redis
 * and failed an assertion, and in CI it hung until the 5s timeout. A test that
 * depends on which runtime is default is testing the default rather than the
 * wiring — so this one names the runtime it means, and covers both.
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

import { Workflow } from './jobs.consts.js';

/**
 * The service, with the runtime this deployment would resolve.
 *
 * **There is no case here for selecting Temporal, and that is a limitation
 * rather than a decision.** `getJobRuntime()` builds its runtime once and
 * caches it inside `@ragenai/jobs`, which vitest externalises — so
 * `vi.resetModules()` hands back a fresh `jobs.service.js` but the *same*
 * cached runtime, and a second case selecting the other adapter would quietly
 * assert against the first one's. The seam's own selection logic is covered
 * where it lives, in `packages/jobs`' `resolveWorkerRuntime` and
 * `getJobRuntime` tests, over every variant. What is left for this file is the
 * binding: that importing the service registers adapters and `start` reaches
 * the resolved one.
 */
async function serviceFor() {
  vi.resetModules();
  delete process.env.WORKER_RUNTIME;

  const { JobsService } = await import('./jobs.service.js');
  return new JobsService();
}

describe('JobsService', () => {
  const originalRuntime = process.env.WORKER_RUNTIME;

  beforeEach(() => {
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

  it('starts the job through the runtime registered for this deployment', async () => {
    const service = await serviceFor();

    await service.start(Workflow.RUN_FILE_EMBEDDINGS, 'doc-abc', {
      id: 'file-1',
    } as never);

    // An unset runtime is BullMQ (ADR-44), and this is the assertion that
    // would have caught the flip breaking the wiring rather than the default.
    //
    // Asserted through the shared `start` spies rather than the constructors:
    // `vi.resetModules()` hands the service a fresh copy of each mocked
    // module, so a constructor imported here is no longer the one it calls,
    // while these spies are created once by `vi.hoisted` and survive.
    expect(mockBullStart).toHaveBeenCalledWith('runFileEmbeddings', 'doc-abc', {
      id: 'file-1',
    });
    expect(mockTemporalStart).not.toHaveBeenCalled();
  });

  it('propagates a failure to start, because the caller rolls back on it', async () => {
    const service = await serviceFor();
    mockBullStart.mockRejectedValue(new Error('redis down'));

    await expect(
      service.start(Workflow.RUN_FILE_EMBEDDINGS, 'doc-abc', {} as never),
    ).rejects.toThrow('redis down');
  });
});
