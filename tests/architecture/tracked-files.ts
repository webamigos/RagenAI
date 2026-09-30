import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

/**
 * The files a guard in this directory reads: the ones git tracks.
 *
 * Most guards used to find their files with a recursive `readdirSync` of the
 * working tree, and on a developer's machine the working tree is not the
 * repository. It holds `volumes/` (Docker's data, thousands of files), and
 * `.claude/worktrees` and its siblings — untracked copies of this repository,
 * each a full second tree of the files the guards are looking for. The walks
 * read all of it: the ADR guard took 5.6 s alone against vitest's 5 s limit, about ten
 * guards timed out together under `npm run verify`, and a stale copy's
 * citations failed a guard the checkout itself passed (#1409). CI has none of
 * those directories, so it stayed green throughout, and the local red read
 * as noise.
 *
 * `git ls-files` is the repository by definition: generated output, caches,
 * `node_modules` and every untracked tree are absent without being named.
 * `.claude/skills/` is tracked, so it stays in scope, which a `.claude` entry
 * in a skip list would have lost.
 *
 * The one thing this changes for someone working locally: a file written and
 * not yet `git add`-ed is not read until it is. CI reads it from its first
 * commit, which is where a guard's verdict matters.
 */

export const REPO_ROOT = join(import.meta.dirname, '..', '..');

let cache: readonly string[] | null = null;

/** Every tracked path, repository-relative, with `/` on every platform. */
export function trackedPaths(): readonly string[] {
  if (cache === null) {
    cache = execFileSync('git', ['ls-files', '-z'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean);
  }
  return cache;
}

export type TrackedFileOptions = {
  /**
   * Directories to read, absolute or repository-relative. Omitted, the whole
   * repository.
   */
  under?: string | readonly string[];
  /** Keep only paths ending in one of these, e.g. `['.ts', '.tsx']`. */
  extensions?: readonly string[];
  /**
   * Directory names skipped at any depth — the guard's own skip list, kept as
   * it was, since a tracked `dist/` or `__tests__/` can still be something a
   * guard means to leave out.
   */
  skipDirs?: ReadonlySet<string> | readonly string[];
  /** Paths as the walks returned them (absolute, the default) or relative. */
  relativePaths?: boolean;
  /** Supply the tracked list, for the helper's own tests. */
  tracked?: readonly string[];
};

function toRelativePosix(dir: string): string {
  const rel = isAbsolute(dir) ? relative(REPO_ROOT, dir) : dir;
  return rel.split(sep).join('/').replace(/\/+$/, '');
}

/**
 * Tracked files, filtered the way the walk they replace filtered them.
 *
 * A path tracked but deleted in the working tree is left out, as a walk would
 * have: the guard reads what is on disk, and an uncommitted deletion takes its
 * contents with it.
 */
export function trackedFiles(options: TrackedFileOptions = {}): string[] {
  const roots = (
    options.under === undefined
      ? ['']
      : typeof options.under === 'string'
        ? [options.under]
        : options.under
  ).map(toRelativePosix);
  const skip = new Set(options.skipDirs ?? []);
  const tracked = options.tracked ?? trackedPaths();

  return tracked
    .filter((path) =>
      roots.some((root) => root === '' || path.startsWith(`${root}/`)),
    )
    .filter(
      (path) =>
        !options.extensions ||
        options.extensions.some((ext) => path.endsWith(ext)),
    )
    .filter((path) => {
      const directories = path.split('/').slice(0, -1);
      return !directories.some((name) => skip.has(name));
    })
    .filter(
      (path) =>
        options.tracked !== undefined || existsSync(join(REPO_ROOT, path)),
    )
    .map((path) => (options.relativePaths ? path : join(REPO_ROOT, path)));
}

const sources = new Map<string, string>();

/**
 * A file's text, read once per process.
 *
 * The guards read the same files over and over: `guardrails-are-not-recopied`
 * re-read every app source for each symbol it bans, and a dozen guards each
 * scan the whole tree. The architecture project runs without per-file
 * isolation (`vitest.config.ts`), so this cache is shared by every guard in a
 * worker, and a file is read once rather than once per case per guard. Under
 * `npm run verify` that is the difference between a guard that finishes and
 * one that misses its budget because four tasks were competing for the disk.
 *
 * Safe because nothing here writes the files it reads during a run.
 */
export function readSource(path: string): string {
  let text = sources.get(path);
  if (text === undefined) {
    text = readFileSync(path, 'utf8');
    sources.set(path, text);
  }
  return text;
}
