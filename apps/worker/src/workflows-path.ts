import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Where Temporal should look for the workflow implementations.
 *
 * This was `require.resolve('./workflows')`, which quietly did real work: under
 * `tsx` it found `src/workflows.ts`, and under `node dist/worker.js` it found
 * `dist/workflows.js`. ESM has no `require`, and `import.meta.resolve` is not a
 * substitute here — it does not consult tsx's loader, so it would hand back a
 * `src/workflows.js` that does not exist.
 *
 * The path has to exist on disk either way: Temporal's bundler calls
 * `statSync` on it before webpack ever sees it, to decide whether to generate a
 * file-sibling or directory-sibling entrypoint. So pick the extension by
 * looking, and fail loudly rather than handing Temporal a path to nothing.
 *
 * It lives here, and not in `worker.ts`, because the workflow tests need the
 * same answer the worker uses. `worker.ts` starts a worker and calls
 * `process.exit` on a bad env as soon as it is imported, so a test cannot
 * reach into it — and the copy the tests kept instead was still the
 * `require.resolve` form, which resolves to nothing under ESM.
 */
export function resolveWorkflowsPath(): string {
  for (const candidate of ['./workflows/index.ts', './workflows/index.js']) {
    const path = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(path)) {
      return path;
    }
  }

  throw new Error(
    `No workflows module beside ${import.meta.url} — looked for ` +
      `workflows/index.ts (tsx) and workflows/index.js (compiled). ` +
      `Did the build run?`,
  );
}
