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
  it('defaults to temporal while that is what the worker runs', () => {
    expect(resolveWorkerRuntime({})).toBe('temporal');
    expect(resolveWorkerRuntime({ WORKER_RUNTIME: '' })).toBe('temporal');
    expect(resolveWorkerRuntime({ WORKER_RUNTIME: '  ' })).toBe('temporal');
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
    registerJobRuntime('temporal', factory);

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
});
