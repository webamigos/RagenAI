import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JobRuntime } from '../runtime-contract';
import {
  clearJobRuntimeRegistry,
  getJobRuntime,
  registerJobRuntime,
  resolveWorkerRuntime,
} from '../runtime';

const stub = (): JobRuntime =>
  ({
    start: vi.fn(),
    getRun: vi.fn(),
    requestCancel: vi.fn(),
    upsertSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
  }) as unknown as JobRuntime;

afterEach(() => {
  clearJobRuntimeRegistry();
});

describe('resolveWorkerRuntime', () => {
  // ADR-44. An unset variable means BullMQ, which is what the compose file
  // starts and what the worker image ships with; Temporal is now the thing an
  // install selects, not the thing it gets by omission.
  it('defaults to bullmq, which is what an install runs', () => {
    expect(resolveWorkerRuntime({})).toBe('bullmq');
    expect(resolveWorkerRuntime({ WORKER_RUNTIME: '' })).toBe('bullmq');
    expect(resolveWorkerRuntime({ WORKER_RUNTIME: '  ' })).toBe('bullmq');
  });

  it('accepts the two runtimes and rejects anything else', () => {
    expect(resolveWorkerRuntime({ WORKER_RUNTIME: 'bullmq' })).toBe('bullmq');
    expect(() => resolveWorkerRuntime({ WORKER_RUNTIME: 'sidekiq' })).toThrow(
      /not a runtime this build knows/,
    );
  });
});

describe('getJobRuntime', () => {
  it('builds the registered adapter once', () => {
    const runtime = stub();
    const factory = vi.fn(() => runtime);
    registerJobRuntime('bullmq', factory);

    expect(getJobRuntime({})).toBe(runtime);
    expect(getJobRuntime({})).toBe(runtime);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('throws when nothing registered an adapter for the selected runtime', () => {
    // The alternative — a no-op runtime — would make a producer's jobs vanish
    // silently, which is indistinguishable from a worker that is merely slow.
    registerJobRuntime('temporal', stub);

    expect(() => getJobRuntime({ WORKER_RUNTIME: 'bullmq' })).toThrow(
      /no adapter registered for WORKER_RUNTIME="bullmq"/,
    );
  });

  /**
   * The same rule from the direction G3 made real, and the reason it is a
   * second case rather than a parameter.
   *
   * Since G3 `@ragenai/jobs-temporal` is in `webamigos/ragen-enterprise`, and
   * `apps/web` and `apps/api` register BullMQ only — so an unmodified build
   * set to `WORKER_RUNTIME=temporal` reaches exactly this throw on its first
   * enqueue. That is the intended behaviour of a real deployment mistake, not
   * an abstract branch, and neither producer's own suite can assert it:
   * `getJobRuntime` caches in this module, which vitest externalises, so
   * `vi.resetModules()` in an app hands back a fresh app module and the same
   * resolved runtime.
   */
  it('throws for temporal on a build that ships only the default adapter', () => {
    registerJobRuntime('bullmq', stub);

    expect(() => getJobRuntime({ WORKER_RUNTIME: 'temporal' })).toThrow(
      /no adapter registered for WORKER_RUNTIME="temporal"/,
    );
  });
});
