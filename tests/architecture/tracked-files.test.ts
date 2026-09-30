import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  REPO_ROOT,
  readSource,
  trackedFiles,
  trackedPaths,
} from './tracked-files';

const TRACKED = [
  'apps/web/src/app/page.tsx',
  'apps/web/src/app/__tests__/page.test.tsx',
  'apps/web/dist/bundle.js',
  'apps/worker/src/worker.ts',
  'docs/adrs/01-first.md',
  '.claude/skills/ragen-code-review/SKILL.md',
  'README.md',
];

const read = (options: Parameters<typeof trackedFiles>[0] = {}) =>
  trackedFiles({ tracked: TRACKED, relativePaths: true, ...options });

describe('trackedFiles', () => {
  it('reads the whole repository by default', () => {
    expect(read()).toEqual(TRACKED);
  });

  it('keeps only the directories asked for, relative or absolute', () => {
    expect(read({ under: 'apps/worker' })).toEqual([
      'apps/worker/src/worker.ts',
    ]);
    expect(read({ under: join(REPO_ROOT, 'docs') })).toEqual([
      'docs/adrs/01-first.md',
    ]);
    expect(read({ under: ['docs', 'apps/worker/'] })).toEqual([
      'apps/worker/src/worker.ts',
      'docs/adrs/01-first.md',
    ]);
  });

  it('does not treat a directory as a prefix of its sibling', () => {
    expect(read({ under: 'apps/web/src/ap' })).toEqual([]);
  });

  it('applies the guard’s own extension and skip rules', () => {
    expect(
      read({
        under: 'apps',
        extensions: ['.ts', '.tsx', '.js'],
        skipDirs: new Set(['dist', '__tests__']),
      }),
    ).toEqual(['apps/web/src/app/page.tsx', 'apps/worker/src/worker.ts']);
  });

  it('returns absolute paths by default, as the walks did', () => {
    expect(trackedFiles({ tracked: TRACKED, under: 'docs' })).toEqual([
      join(REPO_ROOT, 'docs/adrs/01-first.md'),
    ]);
  });
});

// Against the real repository: the property the helper exists for.
describe('trackedPaths', () => {
  const paths = trackedPaths();

  it('holds no untracked tree a developer may have locally', () => {
    for (const untracked of [
      'volumes/',
      '.claude/worktrees',
      'node_modules/',
    ]) {
      expect(paths.filter((path) => path.startsWith(untracked))).toEqual([]);
    }
  });

  it('keeps the tracked skills under .claude', () => {
    expect(paths.some((path) => path.startsWith('.claude/skills/'))).toBe(true);
  });

  it('holds the repository, and returns only files on disk', () => {
    expect(paths).toContain('package.json');
    const existing = trackedFiles({ under: 'tests/architecture' });
    expect(existing.every((path) => existsSync(path))).toBe(true);
  });
});

describe('readSource', () => {
  it('reads a file as UTF-8, and the same text again from memory', () => {
    const path = join(REPO_ROOT, 'package.json');
    const first = readSource(path);
    expect(first).toBe(readFileSync(path, 'utf8'));
    // The same string, not a second read: guards scanning the same tree share
    // the one copy within a worker.
    expect(readSource(path)).toBe(first);
  });
});
