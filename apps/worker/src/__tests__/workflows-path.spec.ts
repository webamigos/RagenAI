import { existsSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { resolveWorkflowsPath } from '../workflows-path.js';

/**
 * Temporal's bundler calls `statSync` on `workflowsPath` before webpack ever
 * sees it. A path to nothing therefore fails inside the bundler rather than
 * here, with a message about the entrypoint rather than about the path — and
 * the worker's own suite would still be green, because `workflow.spec.ts`
 * reports it as "cannot find module '../workflows'".
 *
 * That is exactly how the test suite drifted from the worker once already:
 * `worker.ts` was fixed for ESM and the spec kept its own `require.resolve`
 * copy, which resolves to nothing outside CommonJS. Both now call this.
 */
describe('resolveWorkflowsPath', () => {
  it('returns a path that exists on disk', () => {
    const path = resolveWorkflowsPath();

    expect(existsSync(path)).toBe(true);
    expect(statSync(path).isFile()).toBe(true);
  });

  it('points at the workflows module, not merely at something readable', () => {
    const path = resolveWorkflowsPath();

    expect(basename(dirname(path))).toBe('workflows');
    expect(['index.ts', 'index.js']).toContain(basename(path));
  });
});
