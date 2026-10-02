import ts from 'typescript';
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
 *
 * The scripts are parsed rather than matched as text, so a comment that
 * mentions `closeJobs()` does not stand in for the call.
 */
const SCRIPTS = trackedPaths().filter(
  (path) =>
    path.startsWith('apps/worker/src/scripts/') &&
    path.endsWith('.ts') &&
    !path.includes('__tests__'),
);

/** The callee of every call expression in a file, as written: `jobs`, `process.exit`. */
function calleesOf(path: string): Set<string> {
  const file = ts.createSourceFile(
    path,
    readSource(path),
    ts.ScriptTarget.Latest,
    true,
  );
  const callees = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      callees.add(node.expression.getText(file));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return callees;
}

describe('worker scripts close the job runtime', () => {
  const users = SCRIPTS.filter((path) => calleesOf(path).has('jobs'));

  it('finds the scripts that use the runtime', () => {
    expect(users.length).toBeGreaterThanOrEqual(3);
  });

  it.each(users)('%s ends by closing it or exiting', (path) => {
    const callees = calleesOf(path);
    expect(callees.has('closeJobs') || callees.has('process.exit')).toBe(true);
  });
});
