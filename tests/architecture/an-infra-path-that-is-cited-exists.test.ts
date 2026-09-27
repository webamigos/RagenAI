import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A pointer that outlives the thing it points at.
 *
 * `packages/env/src/fragments.ts` told contributors, in the doc comment for the
 * one fragment declaring every model variable, that the model catalogue lives
 * in `infra/litellm/config.yaml`. B6 deleted that file with the proxy
 * (ADR-49); the comment stayed, and it is the *documented entry point* for
 * adding a model. Someone following it edits nothing, sees no error, and finds
 * out when the model resolves to no route. #1297.
 *
 * What makes this class expensive is that it is silent in both directions. A
 * deleted path does not announce itself to the files that name it, and — worse
 * — `infra/litellm/config.yaml` still *existed* on many machines as an
 * untracked leftover, so the reader's first check confirmed the wrong thing.
 * The same shape is #1134's stale `.env.example` pointer, and it is why
 * `an-adr-reference-resolves.test.ts` exists for citations of records.
 *
 * The rule, per AGENTS.md's "add a guard whenever a rule matters more than a
 * comment can enforce": **a path under `infra/` that a file names is a path
 * that exists.**
 *
 * Two things this deliberately does not do.
 *
 * It does not judge whether the prose around a citation is current — that is a
 * review question, and a test that tried would fail on wording. It catches the
 * half that is mechanical, which is the half thirty-odd files got wrong.
 *
 * It does not police dated records. `docs/adrs/`, `docs/specs/`,
 * `docs/lessons/` and the changelog say what was true when they were written,
 * and an ADR that cannot name the file it replaced cannot explain itself. The
 * files that *do* have to stay current are everything else: code, AGENTS.md,
 * operational docs, skills, evals, `infra/` itself.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * The tree this rule is about is the one git tracks — for the files it reads
 * and for the paths it resolves.
 *
 * A walk of the working tree gets both wrong on a developer's machine, in the
 * same direction as the failure above. `.claude/worktrees*` holds untracked
 * copies of this repository, so their stale citations fail the guard locally
 * while CI stays green; and an untracked leftover such as
 * `infra/litellm/config.yaml` makes a retired path look resolved. Skipping
 * `.claude/` by name would fix the first and drop `.claude/skills/`, which is
 * tracked and has to stay current.
 *
 * A file written but not yet `git add`-ed is read from its first commit on —
 * which is where CI reads it.
 */
function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

/**
 * A cited path resolves when it is a tracked file, or a directory that holds
 * one — `infra/temporal/` is cited as a directory. Git paths use `/` on every
 * platform, and so do citations.
 */
function resolvesIn(tracked: readonly string[]): (path: string) => boolean {
  const paths = new Set(tracked);
  const directories = new Set(
    tracked.flatMap((file) =>
      file
        .split('/')
        .slice(0, -1)
        .map((_, index, parts) => parts.slice(0, index + 1).join('/')),
    ),
  );
  return (path) => paths.has(path) || directories.has(path);
}

/** Directories with nothing hand-written in them. */
const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'playwright-report',
  'test-results',
]);

const SEARCHED_EXTENSIONS = [
  '.md',
  '.mdx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.js',
  '.yml',
  '.yaml',
];

/**
 * Records of what was true on a date. They name retired paths on purpose, and
 * rewriting them to name current ones would be falsifying the record.
 *
 * `docs/lessons.md` is the index of `docs/lessons/` and belongs with it.
 */
const DATED_RECORDS = [
  join('docs', 'adrs'),
  join('docs', 'specs'),
  join('docs', 'lessons'),
  join('docs', 'lessons.md'),
  join('docs', 'changelog-notes.md'),
];

/**
 * Files that are current *and* legitimately name a retired path, because
 * explaining what replaced what is their job.
 *
 * Kept as a list of named files rather than a directory, so adding one is a
 * deliberate line in a diff. If this grows past a handful, the rule is wrong
 * rather than the entries.
 */
const EXPLAINS_A_RETIREMENT = new Set([
  // Says what `routes.yaml` replaced, and that it is mounted the same way.
  join('infra', 'llm-gateway', 'README.md'),
  // The header on a directory nothing reads — see #1297's second half.
  join('infra', 'temporal', 'README.md'),
  // Contrasts the directory that stays against the one that went.
  join('infra', 'README.md'),
]);

/**
 * Files whose `infra/…` is a path in the *generated* project, not in this
 * repository. `create-ragen-app` scaffolds someone else's tree, so a compose
 * file it reasons about is not one of ours and cannot be resolved here.
 */
const NAMES_ANOTHER_PROJECTS_TREE = new Set([
  join('packages', 'create-ragen-app', 'src', 'tasks.ts'),
  join('packages', 'create-ragen-app', 'src', '__tests__', 'tasks.test.ts'),
]);

/**
 * `infra/llm-gateway/routes.yaml`, `./infra/otel/collector-config.yaml`,
 * `infra/presidio/analyzer` — a path, not the bare word. Trailing punctuation
 * and the closing backtick of a code span are stripped below, because a
 * citation is almost always inside one.
 */
const INFRA_PATH = /\binfra\/[A-Za-z0-9][A-Za-z0-9._/-]*/g;

/** `config.yaml`, `config.yaml),` and ``config.yaml` `` all name the same file. */
function trimPunctuation(path: string): string {
  return path.replace(/[.,;:)\]}'"`*/]+$/, '');
}

function isSearched(trackedPath: string): boolean {
  const segments = trackedPath.split('/');
  if (segments.slice(0, -1).some((segment) => SKIP_DIRS.has(segment))) {
    return false;
  }
  return SEARCHED_EXTENSIONS.some((ext) => trackedPath.endsWith(ext));
}

function isExempt(trackedPath: string): boolean {
  if (EXPLAINS_A_RETIREMENT.has(trackedPath)) {
    return true;
  }
  if (NAMES_ANOTHER_PROJECTS_TREE.has(trackedPath)) {
    return true;
  }
  if (DATED_RECORDS.some((record) => trackedPath.startsWith(record))) {
    return true;
  }
  // This file names a deleted path to describe the failure it guards against.
  return trackedPath.startsWith(join('tests', 'architecture'));
}

type Citation = { file: string; path: string };

function citations(files: readonly string[]): Citation[] {
  const found: Citation[] = [];

  for (const file of files) {
    if (!isSearched(file) || isExempt(file)) {
      continue;
    }
    // Tracked but deleted in the working tree: an uncommitted removal, which
    // takes its citations with it.
    const full = join(REPO_ROOT, file);
    if (!existsSync(full)) {
      continue;
    }

    const text = readFileSync(full, 'utf8');
    for (const [match] of text.matchAll(INFRA_PATH)) {
      found.push({ file, path: trimPunctuation(match) });
    }
  }

  return found;
}

const tracked = trackedFiles();
const resolves = resolvesIn(tracked);
const cited = citations(tracked);

describe('an infra/ path that is cited exists', () => {
  it('finds the citations it is meant to police', () => {
    // Guard on the guard. A regex that stops matching, or a walk that stops
    // reaching the tree, would leave every assertion below passing over an
    // empty list and saying nothing.
    expect(cited.length).toBeGreaterThan(5);
    expect(new Set(cited.map((c) => c.file)).size).toBeGreaterThan(3);
  });

  it('resolves every infra/ path named outside a dated record', () => {
    const dangling = cited
      .filter(({ path }) => !resolves(path))
      .map(({ file, path }) => `${file} names ${path}`);

    expect(
      Array.from(new Set(dangling)).sort(),
      'Each of these names a path under infra/ that is not in the tree. A ' +
        'reader follows it, edits nothing or finds nothing, and the mistake ' +
        'is silent — which is exactly how the model catalogue pointer in ' +
        'packages/env survived B6 (#1297). Point at what replaced it. If the ' +
        'file exists to explain a retirement, add it to ' +
        'EXPLAINS_A_RETIREMENT above, deliberately.',
    ).toEqual([]);
  });

  it('fails on a path that does not exist', () => {
    // The mutation the rule exists to catch, run through the same resolution
    // the assertion above uses, so it cannot pass vacuously.
    expect(resolves('infra/litellm/config.yaml')).toBe(false);
    expect(resolves('infra/llm-gateway/routes.yaml')).toBe(true);
    expect(resolves('infra/temporal')).toBe(true);
  });

  it('does not count an untracked leftover as a path that exists', () => {
    // The trap from the header: the retired file is still on disk on many
    // machines. Resolution must not look at the disk at all.
    const resolvesHere = resolvesIn(['infra/llm-gateway/routes.yaml']);
    expect(resolvesHere('infra/litellm/config.yaml')).toBe(false);
    expect(resolvesHere('infra/llm-gateway')).toBe(true);
    expect(resolvesHere('infra/llm')).toBe(false);
  });

  it('reads tracked files only, so a worktree copy under .claude/ is not read', () => {
    const trackedSet = new Set(tracked);
    expect(cited.every(({ file }) => trackedSet.has(file))).toBe(true);
    expect(
      cited.filter(({ file }) => file.startsWith('.claude/worktrees')),
    ).toEqual([]);
    // Excluding the copies must not exclude the tracked skills beside them.
    expect(tracked.some((file) => file.startsWith('.claude/skills/'))).toBe(
      true,
    );
    expect(isSearched('.claude/skills/ragen-code-review/SKILL.md')).toBe(true);
  });

  it('skips generated directories and unsearched extensions', () => {
    expect(isSearched('apps/web/.next/server/app.js')).toBe(false);
    expect(isSearched('packages/env/dist/index.js')).toBe(false);
    expect(isSearched('infra/otel/collector-config.yaml')).toBe(true);
    expect(isSearched('infra/docling/Dockerfile')).toBe(false);
  });

  it('strips the punctuation a citation is usually wrapped in', () => {
    expect(trimPunctuation('infra/llm-gateway/routes.yaml`')).toBe(
      'infra/llm-gateway/routes.yaml',
    );
    expect(trimPunctuation('infra/llm-gateway/routes.yaml),')).toBe(
      'infra/llm-gateway/routes.yaml',
    );
    expect(trimPunctuation('infra/temporal/')).toBe('infra/temporal');
    expect(trimPunctuation('infra/otel/collector-config.yaml')).toBe(
      'infra/otel/collector-config.yaml',
    );
  });
});
