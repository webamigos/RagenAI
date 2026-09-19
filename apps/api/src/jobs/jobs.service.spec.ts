// `vi.mock` is hoisted above these declarations, so they travel up with it.
// jest exempted names beginning with `mock`; vitest has no such exemption.
const { mockBullStart } = vi.hoisted(() => ({
  mockBullStart: vi.fn(),
}));

/**
 * The adapter is stubbed; the seam is not.
 *
 * Mocking `@ragenai/jobs` instead would have left this test asserting that a
 * mock calls a mock — and the thing worth checking here is the wiring itself:
 * that importing the service registers an adapter under the runtime name
 * `getJobRuntime()` resolves to, and that `start` reaches it. That is the
 * whole of what this five-line binding does, and it fails silently when it
 * breaks.
 *
 * **One adapter, since G3.** This file used to stub Temporal alone and lean on
 * it being the default, so ADR-44's flip to BullMQ turned a wiring test into a
 * real `Queue` opening a real connection — locally it reached a developer's
 * Redis and failed an assertion, in CI it hung until the 5s timeout — and the
 * fix was to stub both. There is one to stub now: `@ragenai/jobs-temporal`
 * moved to `webamigos/ragen-enterprise` and this application registers BullMQ
 * only. What a `WORKER_RUNTIME=temporal` deployment gets from an unmodified
 * build is asserted in `packages/jobs`' `runtime.test.ts` — the seam's throw —
 * for the reason the note below gives: `getJobRuntime` caches where
 * `vi.resetModules()` cannot reach.
 */
vi.mock('@ragenai/jobs-bullmq', () => ({
  // `new BullMqJobRuntime()` — an arrow has no [[Construct]].
  BullMqJobRuntime: vi.fn(function () {
    return { start: mockBullStart };
  }),
}));

import { Workflow } from './jobs.consts.js';

/**
 * The service, with the runtime this deployment would resolve.
 *
 * **There is no case here for selecting Temporal, and since G3 that is a
 * decision as well as a limitation.** The limitation: `getJobRuntime()` builds
 * its runtime once and caches it inside `@ragenai/jobs`, which vitest
 * externalises — so `vi.resetModules()` hands back a fresh `jobs.service.js`
 * but the *same* cached runtime, and a second case selecting another adapter
 * would quietly assert against the first one's. The decision: this application
 * registers no Temporal adapter at all now, so there is nothing here for such
 * a case to reach. Both halves are covered in `packages/jobs`' own
 * `resolveWorkerRuntime` and `getJobRuntime` tests. What is left for this file
 * is the binding: that importing the service registers an adapter and `start`
 * reaches the resolved one.
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
  });

  it('propagates a failure to start, because the caller rolls back on it', async () => {
    const service = await serviceFor();
    mockBullStart.mockRejectedValue(new Error('redis down'));

    await expect(
      service.start(Workflow.RUN_FILE_EMBEDDINGS, 'doc-abc', {} as never),
    ).rejects.toThrow('redis down');
  });
});
