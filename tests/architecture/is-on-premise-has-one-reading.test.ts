import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `IS_ON_PREMISE` is read in one place.
 *
 * It was read in four, two ways. The chains asked
 * `!process.env.IS_ON_PREMISE`, so any non-empty string meant on-premise; the
 * rag-settings action asked `=== '1'`. Both typecheck, both look obviously
 * right on their own, and they disagree on the values people actually write:
 *
 * | value | chains | settings page |
 * |---|---|---|
 * | `true` | on-premise | SaaS |
 * | `0` | on-premise | SaaS |
 *
 * So `IS_ON_PREMISE=true` produced an installation where an organization's
 * content-moderation toggle *worked* while the page told the operator it did
 * not — and `0` meant on-premise, the reverse of what writing `0` intends.
 *
 * Nothing in a type system can see this: the drift is between two string
 * comparisons in different files. So it is checked as text, and it fails on
 * the next `process.env.IS_ON_PREMISE` anybody adds.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Where the one reading lives, and the only file allowed to do it. */
const THE_ONE_READING = join('packages', 'env', 'src', 'deployment.ts');

const SEARCH_ROOTS = ['apps', 'packages'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'generated',
  'coverage',
]);
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

/**
 * Drop `//` and block comments, crudely and deliberately.
 *
 * Not a parser: it will also blank the inside of a string literal that happens
 * to contain `//`, which for this rule is harmless — it can only ever hide a
 * match, and a `process.env.IS_ON_PREMISE` written inside such a string is not
 * a reading either.
 */
/**
 * Every spelling of a direct read.
 *
 * Dot access and both quote styles for the bracket form. The first version of
 * this missed `process.env["IS_ON_PREMISE"]`, which is the shape a formatter
 * with different quote settings produces — so a guard against drift had a
 * spelling-shaped hole of its own, which is the joke this comment exists to
 * stop being repeated.
 */
const DIRECT_READ =
  /process\.env\s*(?:\.IS_ON_PREMISE\b|\[\s*['"`]IS_ON_PREMISE['"`]\s*\])/;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* sourceFiles(full);
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      yield full;
    }
  }
}

describe('IS_ON_PREMISE', () => {
  it('is read from process.env in exactly one file', () => {
    const offenders: string[] = [];

    for (const root of SEARCH_ROOTS) {
      for (const file of sourceFiles(join(REPO_ROOT, root))) {
        const rel = relative(REPO_ROOT, file);
        if (rel === THE_ONE_READING) {
          continue;
        }
        // Comments first. This rule is about code, and the files explaining
        // why the rule exists quote the very expression it forbids — this test
        // caught itself on its own prose the first time it ran.
        const code = stripComments(readFileSync(file, 'utf8'));

        if (DIRECT_READ.test(code)) {
          offenders.push(rel);
        }
      }
    }

    expect(
      offenders,
      [
        'These files read IS_ON_PREMISE from the environment directly.',
        `Call \`isOnPremise()\` from @ragenai/env instead — ${THE_ONE_READING}`,
        'holds the one parse, and a second reading of this variable is what',
        'made a per-organization toggle work while the page said it did not.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('is declared in the shared env contract, not per app', () => {
    // ADR-37: a variable read by more than one app belongs in a fragment. This
    // one is read by apps/web and apps/api and was declared by neither.
    const fragments = readFileSync(
      join(REPO_ROOT, 'packages', 'env', 'src', 'fragments.ts'),
      'utf8',
    );

    expect(fragments).toContain('IS_ON_PREMISE');
  });
});
