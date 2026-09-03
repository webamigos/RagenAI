import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

/**
 * A repo-wide invariant, so it lives here rather than in any one workspace:
 * every path glob in CI config must match at least one git-tracked path.
 *
 * All of these constructs fail *open*. A `paths:` filter that matches nothing
 * stops creating the job, `hashFiles()` returns an empty string and collapses a
 * cache key to a constant, a Stryker `mutate` entry silently shrinks the
 * mutation scope, and a CODEOWNERS rule stops requiring a reviewer -- none of
 * them error. ADR-29 broke one of each and CI stayed green.
 *
 * The logic and the allowlist live in `scripts/ci/config-path-globs.mjs` rather
 * than in this file, because the same check has to be runnable on its own:
 * `npm run check:config-paths` is what you want after moving a directory, when
 * running the whole suite to read one report is the wrong tool.
 *
 * See docs/lessons/path-filters-fail-open-after-a-directory-move.md.
 */
// Plain ESM with JSDoc types rather than TypeScript, so the CLI runs under bare
// `node` -- there is no tsconfig at the repo root for it to be checked against.
import {
  ALLOWED_MISSING,
  SOURCES,
  checkPatterns,
  codeownersToGlobs,
  collectFromCodeowners,
  collectPatterns,
  listTrackedPaths,
  normalizePattern,
  patternMatches,
} from '../../scripts/ci/config-path-globs.mjs';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

const TRACKED = ['apps/web/src/lib/auth.ts', 'docs/lessons.md', 'README.md'];

describe('normalizePattern', () => {
  it('skips negation patterns, which match nothing by design', () => {
    expect(normalizePattern('!packages/*/src/**/__tests__/**')).toEqual({
      skip: expect.stringContaining('negation'),
    });
  });

  it('resolves ${{ github.workspace }} to the repo root', () => {
    expect(normalizePattern('${{ github.workspace }}/.next/cache')).toEqual({
      pattern: '.next/cache',
    });
  });

  it('skips any other ${{ }} expression rather than guessing', () => {
    expect(normalizePattern('${{ env.OUT_DIR }}/report')).toEqual({
      skip: expect.stringContaining('${{ }}'),
    });
  });

  it.each(['~/.cache/ms-playwright', '/tmp/apps-api.log'])(
    'skips %s as a non-repository path',
    (raw) => {
      expect(normalizePattern(raw)).toEqual({
        skip: expect.stringContaining('not a repository path'),
      });
    },
  );

  it('strips a leading ./ and a trailing /', () => {
    expect(normalizePattern('./apps/web/evals/results/')).toEqual({
      pattern: 'apps/web/evals/results',
    });
  });

  it.each(['./', '.', '  '])('treats %o as the repository root', (raw) => {
    expect(normalizePattern(raw)).toEqual({
      skip: expect.stringContaining('repository root'),
    });
  });

  // The bug this option exists for: without it every anchored CODEOWNERS rule
  // reads as an absolute path and gets skipped, so the whole file goes
  // unchecked while the guard still reports success.
  it('treats a leading / as a root anchor under gitignore syntax', () => {
    expect(
      normalizePattern('/apps/web/src/lib/auth.ts', { gitignoreSyntax: true }),
    ).toEqual({
      pattern: 'apps/web/src/lib/auth.ts',
    });
    expect(normalizePattern('/apps/web/src/lib/auth.ts')).toEqual({
      skip: expect.stringContaining('not a repository path'),
    });
  });
});

describe('patternMatches', () => {
  it('matches a file pattern', () => {
    expect(patternMatches('apps/web/src/**/*.ts', TRACKED)).toBe(true);
  });

  it('matches a directory pattern, which no tracked path equals outright', () => {
    expect(patternMatches('apps/web/src/lib', TRACKED)).toBe(true);
  });

  it('reports a pattern that matches nothing', () => {
    expect(patternMatches('src/lib/auth.ts', TRACKED)).toBe(false);
  });
});

describe('codeownersToGlobs', () => {
  it('expands the catch-all rule', () => {
    expect(codeownersToGlobs('*')).toEqual(['**']);
  });

  it('anchors a rule with a leading slash', () => {
    expect(codeownersToGlobs('/LICENSE')).toEqual(['LICENSE', 'LICENSE/**']);
  });

  it('treats a trailing slash as "this directory and its contents"', () => {
    expect(codeownersToGlobs('/prisma/')).toEqual(['prisma/**']);
  });

  it('lets a rule with no slash match at any depth', () => {
    expect(codeownersToGlobs('Dockerfile')).toContain('**/Dockerfile');
  });
});

describe('checkPatterns', () => {
  const dead = {
    file: 'x.yml',
    line: 3,
    raw: 'src/libs/chains/**',
    source: SOURCES.workflowPaths,
  };

  it('reports a pattern that matches no tracked path', () => {
    const result = checkPatterns([dead], TRACKED, []);
    expect(result.dead).toHaveLength(1);
    expect(result.dead[0]).toMatchObject({ file: 'x.yml', line: 3 });
  });

  it('accepts an allowlisted build-output path whose committed prefix exists', () => {
    const allowlist = [
      { pattern: 'apps/web/.next/cache', mustExist: 'apps/web', reason: 'r' },
    ];
    const found = [
      { file: 'x.yml', line: 1, raw: 'apps/web/.next/cache', source: 'p' },
    ];
    const result = checkPatterns(found, TRACKED, allowlist);
    expect(result.dead).toEqual([]);
    expect(result.allowed).toHaveLength(1);
  });

  // An allowlist entry must not become a blanket exemption: the committed part
  // of the path is still checked, and that is the half a directory move breaks.
  it('rejects an allowlisted path whose committed prefix has moved', () => {
    const allowlist = [
      { pattern: '.next/cache', mustExist: 'apps/webb', reason: 'r' },
    ];
    const found = [{ file: 'x.yml', line: 1, raw: '.next/cache', source: 'p' }];
    const result = checkPatterns(found, TRACKED, allowlist);
    expect(result.dead).toHaveLength(1);
    expect(result.dead[0].why).toContain('apps/webb');
  });

  it('reports an allowlist entry no config references any more', () => {
    const allowlist = [
      { pattern: 'gone/output', mustExist: null, reason: 'r' },
    ];
    const result = checkPatterns([], TRACKED, allowlist);
    expect(result.unusedAllowlist).toHaveLength(1);
  });

  it('applies gitignore syntax to CODEOWNERS rules only', () => {
    const found = [
      {
        file: '.github/CODEOWNERS',
        line: 1,
        raw: '/apps/web/src/lib/auth.ts',
        source: SOURCES.codeowners,
      },
      {
        file: 'x.yml',
        line: 1,
        raw: '/apps/web/src/lib/auth.ts',
        source: SOURCES.workflowPaths,
      },
    ];
    const result = checkPatterns(found, TRACKED, []);
    expect(result.checked).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });
});

describe('CODEOWNERS parsing', () => {
  // A section header reaching picomatch would be read as a character class,
  // match nothing, and fail the guard on a correct file.
  it.each(['[Auth]', '^[Auth]', '[Auth][2]'])(
    'ignores the section header %s rather than reading it as a path',
    (header) => {
      const found = collectFromCodeowners(
        'CODEOWNERS',
        `${header}\n/LICENSE @someone\n`,
      );
      expect(found.map((f: { raw: string }) => f.raw)).toEqual(['/LICENSE']);
    },
  );

  it('ignores comments and blank lines', () => {
    const found = collectFromCodeowners(
      'CODEOWNERS',
      '# a comment\n\n/LICENSE @someone\n',
    );
    expect(found).toHaveLength(1);
  });
});

describe('collectPatterns', () => {
  // Without this, the guard has the exact failure mode it exists to prevent: if
  // the YAML walk or the hashFiles regex stops finding anything, it reports
  // zero dead patterns and passes.
  it('finds patterns from every source it claims to walk', async () => {
    const patterns = await collectPatterns(repoRoot);
    // Anchored, not a substring match: `on.<event>.paths` is a prefix of
    // `on.<event>.paths-ignore`, so a `includes()` here would let the
    // paths-ignore patterns satisfy the paths assertion -- and the `paths:`
    // category could stop being collected entirely with this test still green.
    // Sources are either the bare label or `<label> (<detail>)`.
    const bySource = (label: string) =>
      patterns.filter(
        (p: { source: string }) =>
          p.source === label || p.source.startsWith(`${label} (`),
      );

    expect(bySource(SOURCES.workflowPaths).length).toBeGreaterThan(0);
    expect(bySource(SOURCES.workflowPathsIgnore).length).toBeGreaterThan(0);
    expect(bySource(SOURCES.hashFiles).length).toBeGreaterThan(0);
    expect(bySource(SOURCES.actionPath).length).toBeGreaterThan(0);
    expect(bySource(SOURCES.codeowners).length).toBeGreaterThan(0);
    expect(bySource(SOURCES.strykerMutate).length).toBeGreaterThan(0);
  });

  it('records a file and line for every pattern, so failures are navigable', async () => {
    const patterns = await collectPatterns(repoRoot);
    for (const found of patterns) {
      expect(found.file, JSON.stringify(found)).toBeTruthy();
      expect(found.line, JSON.stringify(found)).toBeGreaterThan(0);
    }
  });
});

// The guard itself. Also runs standalone as `npm run check:config-paths`, and
// in CI as the `Config / Path globs` job.
describe('the repository', () => {
  it('has no CI config pattern that matches nothing', async () => {
    const result = checkPatterns(
      await collectPatterns(repoRoot),
      listTrackedPaths(repoRoot),
    );
    expect(
      result.dead.map(
        (d: { file: string; line: number; raw: string }) =>
          `${d.file}:${d.line} ${d.raw}`,
      ),
    ).toEqual([]);
  });

  it('has no stale ALLOWED_MISSING entry', async () => {
    const result = checkPatterns(
      await collectPatterns(repoRoot),
      listTrackedPaths(repoRoot),
    );
    expect(
      result.unusedAllowlist.map((e: { pattern: string }) => e.pattern),
    ).toEqual([]);
  });

  it('documents a reason for every allowlist entry', () => {
    for (const entry of ALLOWED_MISSING) {
      expect(entry.reason, entry.pattern).toBeTruthy();
      expect(entry).toHaveProperty('mustExist');
    }
  });
});
