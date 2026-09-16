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
});
