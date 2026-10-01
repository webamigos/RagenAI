import { describe, expect, it } from 'vitest';

import { readSource, trackedPaths } from './tracked-files';

/**
 * A worker script that starts or schedules a job must release the job
 * runtime before it returns.
 *
 * BullMQ's queues hold a Redis connection, and an open connection keeps
 * Node's event loop alive after `main()` resolves. `reindex-for-context.ts`
 * printed `Started 28.` on demo and then sat there, so the operator's loop
 * over organizations never reached the second one — and the two schedule
 * scripts had the same ending. `closeJobs()` (or an explicit `process.exit`,
 * as the load test does) is what lets the process end.
 */
const SCRIPTS = trackedPaths().filter(
  (path) =>
    path.startsWith('apps/worker/src/scripts/') &&
    path.endsWith('.ts') &&
    !path.includes('__tests__'),
);

describe('worker scripts close the job runtime', () => {
  const users = SCRIPTS.filter((path) => /\bjobs\(\)/.test(readSource(path)));

  it('finds the scripts that use the runtime', () => {
    expect(users.length).toBeGreaterThanOrEqual(3);
  });

  it.each(users)('%s ends by closing it or exiting', (path) => {
    const source = readSource(path);
    expect(
      /\bcloseJobs\(\)/.test(source) || /\bprocess\.exit\(/.test(source),
    ).toBe(true);
  });
});
