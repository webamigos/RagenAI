import { describe, expect, it } from 'vitest';

import {
  resolveRunnableRuntime,
  UNIMPLEMENTED_RUNTIME_MESSAGE,
} from '../runtime-guard.js';

/**
 * The seam accepts `bullmq` before an adapter exists, which is deliberate — a
 * deployment should be told about `REDIS_URL` at boot. The consequence is that
 * this build can be *configured* for a runtime it cannot run, and the only
 * thing standing between that and a worker which starts and silently processes
 * nothing is this check.
 */
describe('resolveRunnableRuntime', () => {
  it('runs on temporal', () => {
    expect(resolveRunnableRuntime({ WORKER_RUNTIME: 'temporal' })).toEqual({
      ok: true,
      runtime: 'temporal',
    });
  });

  it('runs when the runtime is unset, because temporal is the default', () => {
    expect(resolveRunnableRuntime({})).toEqual({
      ok: true,
      runtime: 'temporal',
    });
  });

  // The case that matters. Without it the worker falls through to
  // NativeConnection.connect, reaches localhost:7233 and reports itself
  // healthy while no BullMQ job is ever picked up.
  it('refuses bullmq while this build has no adapter for it', () => {
    const result = resolveRunnableRuntime({ WORKER_RUNTIME: 'bullmq' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(UNIMPLEMENTED_RUNTIME_MESSAGE);
      // Names the variable and a value that works, rather than only saying no.
      expect(result.message).toContain('WORKER_RUNTIME=temporal');
    }
  });

  // A typo is rejected by the seam itself, and louder than this guard would:
  // it names the values it knows.
  it('lets an unknown runtime throw rather than reporting it as unimplemented', () => {
    expect(() => resolveRunnableRuntime({ WORKER_RUNTIME: 'sidekiq' })).toThrow(
      /sidekiq/,
    );
  });
});
