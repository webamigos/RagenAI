import { existsSync, readFileSync } from 'node:fs';
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
 * The root is found by walking up to the first directory whose
 * `package.json` declares `workspaces`, so this does not hardcode how deep
 * `apps/api` sits. That is npm's own definition of the workspace root, and a
 * package cannot carry one without breaking `npm install` — nested workspaces
 * are not supported — so a stray copy cannot appear silently.
 *
 * Two earlier markers each matched a file that later appeared inside the
 * app. A lockfile: `apps/api` carried one from its standalone days, which
 * made the app its own root (now kept out by
 * `tests/architecture/only-the-repository-root-has-a-lockfile.test.ts`).
 * Then `turbo.json`: #1574 gave every app a package-level Turborepo config
 * (`"extends": ["//"]`), and the walk stopped at `apps/api` again, so the
 * root `.env.local` went unread and `npm run api:dev` failed on
 * `TARGET_ENV: Invalid option`. Any marker that is a bare filename can be
 * re-created one directory down; check what the file says, not that it
 * exists.
 */
export type LoadLocalEnvOptions = {
  /** Where the app runs from; defaults to `process.cwd()`. */
  cwd?: string;
  /** Decides whether a directory is the repository root. */
  isRoot?: (dir: string) => boolean;
};

const FILES = ['.env.local', '.env'] as const;

/** True for the directory whose `package.json` declares npm workspaces. */
export function isWorkspaceRoot(dir: string): boolean {
  const manifest = path.join(dir, 'package.json');
  if (!existsSync(manifest)) {
    return false;
  }
  try {
    const { workspaces } = JSON.parse(readFileSync(manifest, 'utf8')) as {
      workspaces?: unknown;
    };
    return workspaces !== undefined && workspaces !== null;
  } catch {
    return false;
  }
}

export function findRepositoryRoot(
  start: string,
  isRoot: (dir: string) => boolean = isWorkspaceRoot,
): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (isRoot(dir)) {
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
  const root = findRepositoryRoot(cwd, options.isRoot);
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
