#!/usr/bin/env node
/**
 * CI entry point for the path-glob guard. See `config-path-globs.mjs` for what
 * it walks and why, and `docs/lessons/path-filters-fail-open-after-a-directory-move.md`
 * for the incident that prompted it.
 *
 *   node scripts/ci/check-config-path-globs.mjs [--verbose]
 *
 * Exits 1 with a file:line report when a pattern matches nothing.
 */
import { execFileSync } from 'node:child_process';

import {
  checkPatterns,
  collectPatterns,
  formatReport,
  listTrackedPaths,
} from './config-path-globs.mjs';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

const verbose = process.argv.includes('--verbose');
const result = checkPatterns(
  await collectPatterns(repoRoot),
  listTrackedPaths(repoRoot),
);
const failed = result.dead.length > 0 || result.unusedAllowlist.length > 0;

if (failed) {
  console.error('CI config references paths that do not exist:\n');
}
console[failed ? 'error' : 'log'](formatReport(result, { verbose }));

if (failed) {
  console.error(
    '\nEvery construct above fails open — a pattern that matches nothing does not\n' +
      'error, it just quietly stops doing its job. Either fix the path, or add it to\n' +
      'ALLOWED_MISSING in scripts/ci/config-path-globs.mjs with a reason.',
  );
  process.exit(1);
}
