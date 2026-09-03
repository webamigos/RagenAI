/**
 * Guard against path globs in CI config that no longer match anything.
 *
 * Every construct this walks fails *open*: a `paths:` filter that matches
 * nothing silently stops creating the job (no red X, no skipped job), a
 * `hashFiles()` glob that matches nothing collapses a cache key to a constant,
 * a Stryker `mutate` entry that matches nothing quietly shrinks the mutation
 * scope, and a CODEOWNERS rule that matches nothing stops requiring a reviewer.
 * ADR-29 (moving the Next.js app into `apps/web/`) broke one of each and CI
 * stayed green. See `docs/lessons/path-filters-fail-open-after-a-directory-move.md`.
 *
 * Patterns are resolved against **git-tracked paths**, not the working tree.
 * That is deliberate: the working tree also holds gitignored build output, and
 * a glob kept "alive" by a local `dist/` or generated client is exactly the
 * fail-open case this guard exists to catch — it would pass locally and match
 * nothing on a fresh CI checkout.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import picomatch from 'picomatch';
import {
  LineCounter,
  parseDocument,
  visit,
  isMap,
  isSeq,
  isScalar,
} from 'yaml';

/**
 * Paths that legitimately do not exist in a clean checkout, and so cannot be
 * verified by existence. Each entry is matched against the **exact** normalized
 * pattern as written in config, so moving a directory forces a deliberate edit
 * here rather than silently widening the exemption.
 *
 * `mustExist` is the deepest part of the path that *is* committed. Checking it
 * is what still catches a directory move: `apps/web/.next/cache` cannot be
 * verified, but `apps/web` can, and that is the half ADR-29 changed. Use `null`
 * only when a path has no committed prefix at all.
 *
 * Do not add a wildcard or a prefix rule here. The value of this list is that
 * it is short, literal, and reviewable.
 */
export const ALLOWED_MISSING = [
  {
    pattern: 'apps/web/.next/cache',
    mustExist: 'apps/web',
    reason:
      'Next.js build cache, written by `next build`. This is the value ADR-29 broke — it pointed at the repo root, so the cache saved and restored nothing.',
  },
  {
    pattern: 'node_modules',
    mustExist: null,
    reason:
      'Install output. Gitignored by definition, and always at the repo root.',
  },
  {
    pattern: 'reports/mutation',
    mustExist: null,
    reason:
      "Stryker's HTML report (`htmlReporter.fileName`), at the repo root. A committed copy used to make this pattern pass; dropping that build output is what left it needing an entry here.",
  },
  {
    pattern: 'apps/web/ctrf/*.json',
    mustExist: 'apps/web',
    reason:
      'CTRF JSON written by the Playwright run (playwright-ctrf-json-reporter), read back by the test reporter in the same job.',
  },
  {
    pattern: 'apps/web/playwright-report',
    mustExist: 'apps/web',
    reason: 'Playwright HTML report, written by the E2E run.',
  },
];

/** Pattern sources, in the order they are reported. */
export const SOURCES = {
  workflowPaths: 'on.<event>.paths',
  workflowPathsIgnore: 'on.<event>.paths-ignore',
  hashFiles: 'hashFiles()',
  actionPath: 'action path input',
  codeowners: 'CODEOWNERS rule',
  strykerMutate: 'stryker mutate',
};

/**
 * Actions with a `with:` input that names repository paths, and which inputs
 * those are. `ctrf-io/github-test-reporter` is here because its `report-path`
 * broke exactly the way the cache and artifact paths did in ADR-29, and reading
 * a report that is not there is another silent no-op.
 *
 * `actions/download-artifact` is deliberately absent: its `path` is where the
 * artifact gets extracted *to*, so it is not expected to exist beforehand.
 */
const PATH_TAKING_ACTIONS = [
  { action: /^actions\/(cache|upload-artifact)(\/|@|$)/, keys: ['path'] },
  { action: /^ctrf-io\/github-test-reporter(\/|@|$)/, keys: ['report-path'] },
];

/**
 * Reasons a pattern is structurally unverifiable, and is skipped rather than
 * allowlisted. Unlike ALLOWED_MISSING these are properties of the pattern
 * itself, not facts about this repository, so they need no per-path review.
 */
const SKIP_REASONS = {
  negation: 'negation pattern — matching nothing is its normal state',
  outsideRepo:
    'not a repository path (absolute, or under the runner home directory)',
  dynamic: 'contains an unresolved ${{ }} expression',
  repoRoot: 'the repository root',
};

/** @returns {string[]} every path tracked by git, repo-relative, POSIX separators. */
export function listTrackedPaths(repoRoot) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

/**
 * Normalize a raw config value into a repo-relative glob, or explain why it
 * cannot be checked.
 *
 * `gitignoreSyntax` is for CODEOWNERS, where a leading `/` anchors the rule to
 * the repository root rather than naming an absolute path. Getting this wrong
 * is not a cosmetic difference: it silently skips every anchored rule in the
 * file, which is the same fail-open failure this guard is here to prevent.
 *
 * @returns {{pattern: string} | {skip: string}}
 */
export function normalizePattern(raw, { gitignoreSyntax = false } = {}) {
  let value = String(raw).trim();
  if (!value) {
    return { skip: SKIP_REASONS.repoRoot };
  }
  if (value.startsWith('!')) {
    return { skip: SKIP_REASONS.negation };
  }
  // `${{ github.workspace }}` *is* the repo root on a checkout, so it resolves.
  value = value.replace(/\$\{\{\s*github\.workspace\s*\}\}\/?/g, '');
  if (value.includes('${{')) {
    return { skip: SKIP_REASONS.dynamic };
  }
  if (gitignoreSyntax) {
    value = value.replace(/^\/+/, '');
  } else if (value.startsWith('~') || path.posix.isAbsolute(value)) {
    return { skip: SKIP_REASONS.outsideRepo };
  }
  value = value.replace(/^\.\//, '').replace(/\/+$/, '');
  if (value === '' || value === '.') {
    return { skip: SKIP_REASONS.repoRoot };
  }
  return { pattern: value };
}

/** Does `pattern` match at least one of `trackedPaths`? */
export function patternMatches(pattern, trackedPaths) {
  // Tracked paths are files, never bare directories, so a pattern naming a
  // directory only matches once `/**` is appended.
  const isMatch = picomatch([pattern, `${pattern}/**`], { dot: true });
  return trackedPaths.some((p) => isMatch(p));
}

/**
 * Expand a CODEOWNERS rule into the globs it is equivalent to. CODEOWNERS uses
 * gitignore syntax: a leading `/` anchors to the repo root, a pattern with no
 * `/` at all matches at any depth, and a trailing `/` means "this directory".
 */
export function codeownersToGlobs(rule) {
  if (rule === '*') {
    return ['**'];
  }
  const trailingSlash = rule.endsWith('/');
  const body = rule.replace(/^\/+/, '').replace(/\/+$/, '');
  const anchored = rule.startsWith('/') || rule.slice(0, -1).includes('/');
  const bases = anchored ? [body] : [body, `**/${body}`];
  return trailingSlash
    ? bases.map((b) => `${b}/**`)
    : bases.flatMap((b) => [b, `${b}/**`]);
}

function lineOf(lineCounter, offset) {
  return lineCounter.linePos(offset).line;
}

/** Split a workflow `path:` value, which may be a `|` block listing several. */
function splitActionPath(value) {
  return String(value)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function collectFromWorkflow(file, text) {
  const found = [];
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });

  // YAML 1.2 keeps `on` a string, but be tolerant of a 1.1-style boolean key.
  const triggers = doc.get('on') ?? doc.get(true);
  if (isMap(triggers)) {
    for (const { key: event, value: config } of triggers.items) {
      if (!isMap(config)) {
        continue;
      }
      for (const [field, source] of [
        ['paths', SOURCES.workflowPaths],
        ['paths-ignore', SOURCES.workflowPathsIgnore],
      ]) {
        const seq = config.get(field, true);
        if (!isSeq(seq)) {
          continue;
        }
        for (const item of seq.items) {
          if (isScalar(item) && typeof item.value === 'string') {
            found.push({
              file,
              line: lineOf(lineCounter, item.range[0]),
              raw: item.value,
              source: `${source} (${String(event)})`,
            });
          }
        }
      }
    }
  }

  visit(doc, {
    Map(_key, node) {
      const uses = node.get('uses');
      if (typeof uses !== 'string') {
        return;
      }
      const spec = PATH_TAKING_ACTIONS.find((entry) => entry.action.test(uses));
      if (!spec) {
        return;
      }
      const withNode = node.get('with', true);
      if (!isMap(withNode)) {
        return;
      }
      for (const key of spec.keys) {
        const pathNode = withNode.get(key, true);
        if (!isScalar(pathNode) || typeof pathNode.value !== 'string') {
          continue;
        }
        const line = lineOf(lineCounter, pathNode.range[0]);
        for (const raw of splitActionPath(pathNode.value)) {
          found.push({
            file,
            line,
            raw,
            source: `${SOURCES.actionPath} (${uses} ${key})`,
          });
        }
      }
    },
  });

  // hashFiles() is read off the raw text rather than the parsed tree: it can
  // appear in any `if:`, `key:` or `restore-keys:` expression, and every
  // argument is a literal glob.
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const call of line.matchAll(/hashFiles\(([^)]*)\)/g)) {
      for (const arg of call[1].matchAll(/'([^']*)'|"([^"]*)"/g)) {
        found.push({
          file,
          line: index + 1,
          raw: arg[1] ?? arg[2],
          source: SOURCES.hashFiles,
        });
      }
    }
  });

  return found;
}

export function collectFromCodeowners(file, text) {
  const found = [];
  text.split('\n').forEach((line, index) => {
    const stripped = line.replace(/#.*$/, '').trim();
    if (!stripped) {
      return;
    }
    // GitHub's section syntax -- `[Auth]`, `^[Auth][2]` -- is a header, not a
    // path. Left alone it would reach picomatch as a character class, match
    // nothing, and fail this guard on a file that is perfectly correct.
    if (/^\^?\[/.test(stripped)) {
      return;
    }
    const [rule] = stripped.split(/\s+/);
    if (rule) {
      found.push({
        file,
        line: index + 1,
        raw: rule,
        source: SOURCES.codeowners,
      });
    }
  });
  return found;
}

async function collectFromStryker(repoRoot, file) {
  const configPath = path.join(repoRoot, file);
  const { default: config } = await import(pathToFileURL(configPath).href);
  const text = readFileSync(configPath, 'utf8');
  const lines = text.split('\n');
  return (config.mutate ?? []).map((raw) => ({
    file,
    line: lines.findIndex((line) => line.includes(`'${raw}'`)) + 1 || 1,
    raw,
    source: SOURCES.strykerMutate,
  }));
}

/**
 * Gather every path pattern this guard is responsible for.
 *
 * @returns {Promise<Array<{file: string, line: number, raw: string, source: string}>>}
 */
export async function collectPatterns(repoRoot) {
  const workflowDir = path.join(repoRoot, '.github', 'workflows');
  const workflowFiles = (await readdir(workflowDir))
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();

  const found = [];
  for (const name of workflowFiles) {
    const rel = path.posix.join('.github/workflows', name);
    found.push(
      ...collectFromWorkflow(
        rel,
        readFileSync(path.join(workflowDir, name), 'utf8'),
      ),
    );
  }
  found.push(
    ...collectFromCodeowners(
      '.github/CODEOWNERS',
      readFileSync(path.join(repoRoot, '.github/CODEOWNERS'), 'utf8'),
    ),
  );
  found.push(...(await collectFromStryker(repoRoot, 'stryker.config.mjs')));
  return found;
}

/**
 * Resolve every pattern against the tracked paths.
 *
 * @returns {{dead: object[], skipped: object[], allowed: object[], checked: object[], unusedAllowlist: object[]}}
 */
export function checkPatterns(
  patterns,
  trackedPaths,
  allowlist = ALLOWED_MISSING,
) {
  const byPattern = new Map(allowlist.map((entry) => [entry.pattern, entry]));
  const usedAllowlist = new Set();
  const dead = [];
  const skipped = [];
  const allowed = [];
  const checked = [];

  for (const found of patterns) {
    const isCodeowners = found.source === SOURCES.codeowners;
    const normalized = normalizePattern(found.raw, {
      gitignoreSyntax: isCodeowners,
    });
    if ('skip' in normalized) {
      skipped.push({ ...found, why: normalized.skip });
      continue;
    }
    const { pattern } = normalized;

    const exemption = byPattern.get(pattern);
    if (exemption) {
      usedAllowlist.add(pattern);
      if (
        exemption.mustExist &&
        !patternMatches(exemption.mustExist, trackedPaths)
      ) {
        dead.push({
          ...found,
          pattern,
          why: `allowlisted as build output, but its committed prefix "${exemption.mustExist}" matches nothing`,
        });
      } else {
        allowed.push({ ...found, pattern, reason: exemption.reason });
      }
      continue;
    }

    const globs = isCodeowners ? codeownersToGlobs(found.raw) : [pattern];
    if (globs.some((glob) => patternMatches(glob, trackedPaths))) {
      checked.push({ ...found, pattern });
    } else {
      dead.push({ ...found, pattern, why: 'matches no git-tracked path' });
    }
  }

  // A stale exemption is the same fail-open bug one level up: it would keep
  // covering a path nobody references any more.
  const unusedAllowlist = allowlist.filter(
    (entry) => !usedAllowlist.has(entry.pattern),
  );

  return { dead, skipped, allowed, checked, unusedAllowlist };
}

/** @returns {string} a human-readable report of a {@link checkPatterns} result. */
export function formatReport(result, { verbose = false } = {}) {
  const lines = [];

  if (verbose) {
    for (const entry of result.checked) {
      lines.push(
        `  ok       ${entry.file}:${entry.line}  ${entry.raw}  [${entry.source}]`,
      );
    }
    for (const entry of result.allowed) {
      lines.push(
        `  allowed  ${entry.file}:${entry.line}  ${entry.raw}  — ${entry.reason}`,
      );
    }
    for (const entry of result.skipped) {
      lines.push(
        `  skipped  ${entry.file}:${entry.line}  ${entry.raw}  — ${entry.why}`,
      );
    }
    if (lines.length) {
      lines.push('');
    }
  }

  for (const entry of result.dead) {
    lines.push(`${entry.file}:${entry.line}  ${entry.raw}`);
    lines.push(`    source: ${entry.source}`);
    lines.push(`    ${entry.why}`);
    lines.push('');
  }

  for (const entry of result.unusedAllowlist) {
    lines.push(`scripts/ci/config-path-globs.mjs  ${entry.pattern}`);
    lines.push('    source: ALLOWED_MISSING');
    lines.push(
      '    no config references this path any more — delete the entry',
    );
    lines.push('');
  }

  lines.push(
    `${result.checked.length} verified, ${result.allowed.length} allowlisted, ` +
      `${result.skipped.length} skipped, ${result.dead.length} dead, ` +
      `${result.unusedAllowlist.length} stale allowlist entries.`,
  );
  return lines.join('\n');
}
