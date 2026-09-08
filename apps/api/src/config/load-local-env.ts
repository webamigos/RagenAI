import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenvFile } from 'dotenv';

/**
 * Fill in local configuration from the files a developer actually has.
 *
 * `apps/web` and `apps/admin` read the repository root's `.env.local` through
 * `scripts/load-root-env.mjs`, so one file configures the whole monorepo
 * (AGENTS.md, "Local Development"). This service did not: Nest's
 * `ConfigModule` reads only `apps/api/.env(.local)`, and it does so *after*
 * `parseApiEnv()` has already refused to boot on the missing `DATABASE_URL`.
 * So `npm run api:dev` on a fresh clone died with a validation report while
 * the same variables sat one directory up — and a chat could not be traced
 * through a local Qdrant, because the route that reaches it lives here.
 *
 * Precedence is the one `load-root-env.mjs` documents, and it falls out of
 * dotenv's own rule (it never overwrites a variable that is already set):
 *
 *   1. real environment variables — a container's own config
 *   2. this app's `.env.local`, then `.env`
 *   3. the repository root's `.env.local`, then `.env` — gaps only
 *
 * Nothing here affects a deployment: the production image carries no `.env`
 * files, and its variables arrive set, so every `dotenv` call is a no-op.
 *
 * Paths come from `cwd` rather than `import.meta.url`: `nest start` runs from
 * `apps/api`, the workspace script sets that cwd from the root too, and
 * `import.meta` is not available under the CommonJS transform the tests use.
 * The root is found by walking up to the first directory holding
 * `turbo.json`, so this does not hardcode how deep `apps/api` sits. Not a
 * lockfile: when this was written `apps/api` still carried one from its
 * standalone days, which made the app its own root and stopped the walk one
 * directory early. That file is gone and
 * `tests/architecture/only-the-repository-root-has-a-lockfile.test.ts` keeps
 * it gone, but `turbo.json` stays the marker — it is what actually defines
 * the workspace root, and it cannot be re-created by an `npm install` in the
 * wrong directory.
 */
export type LoadLocalEnvOptions = {
  /** Where the app runs from; defaults to `process.cwd()`. */
  cwd?: string;
  /** File whose presence marks the repository root. */
  rootMarker?: string;
};

const ROOT_MARKER = 'turbo.json';
const FILES = ['.env.local', '.env'] as const;

export function findRepositoryRoot(
  start: string,
  marker: string = ROOT_MARKER,
): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, marker))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function localEnvCandidates(
  options: LoadLocalEnvOptions = {},
): string[] {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const dirs = [cwd];
  const root = findRepositoryRoot(cwd, options.rootMarker);
  if (root && root !== cwd) {
    dirs.push(root);
  }
  return dirs.flatMap((dir) => FILES.map((file) => path.join(dir, file)));
}

/**
 * Loads every candidate that exists, in precedence order, and returns the
 * paths it read — so a boot log can say where a value came from.
 */
export function loadLocalEnv(options: LoadLocalEnvOptions = {}): string[] {
  const loaded: string[] = [];
  for (const file of localEnvCandidates(options)) {
    if (existsSync(file)) {
      loadDotenvFile({ path: file, quiet: true });
      loaded.push(file);
    }
  }
  return loaded;
}
