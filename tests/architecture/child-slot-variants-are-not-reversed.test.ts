import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A `data-slot` variant that styles a child must be written `*:data-[…]`, not
 * `data-[…]:*`.
 *
 * Tailwind v4 composes variants left to right, so the two forms are different
 * selectors, and only one of them is ever what the author meant:
 *
 *   `*:data-[slot=icon]:size-6`  ->  :is(.cls > *)[data-slot=icon]
 *       a direct child that carries the attribute — the intent
 *
 *   `data-[slot=icon]:*:size-6`  ->  :is(.cls[data-slot=icon] > *)
 *       the element carrying the class must itself carry the attribute, and
 *       then it styles every child — almost never true
 *
 * Both selectors above were read out of the built stylesheet, not inferred.
 *
 * This is worth a guard because the failure is completely silent. The class is
 * valid, Tailwind generates a rule for it, nothing warns, and the rule simply
 * never matches. `common-ui/Sidebar` and `common-ui/Navbar` both inherited the
 * reversed form from the component kit they replaced, and in the navbar's case
 * it meant the mobile menu icon rendered with the SVG default `fill` — a black
 * glyph on a dark panel — for as long as the file existed.
 *
 * Scope is our own component directories, which is now all of them: the
 * vendored kit that held every other instance of the reversed form was
 * deleted when ADR-41 finished.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const OUR_COMPONENT_DIRS = [
  join(REPO_ROOT, 'apps', 'web', 'src', 'libs', 'common-ui'),
  join(REPO_ROOT, 'apps', 'web', 'src', 'components', 'ui'),
];

/** The reversed form: an attribute variant, then the child selector. */
const REVERSED = /data-\[slot=[a-z-]+\]:(?:[a-z-]+:)*\*:/;

/** The correct form, used to prove this test is looking at real files. */
const CORRECT = /\*:data-\[slot=[a-z-]+\]:/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Comments are stripped first. The file that prompted this guard explains the
 * reversed form in prose and quotes it verbatim, so a naive scan would flag
 * the very comment warning against it.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function ourComponentSources(): { path: string; code: string }[] {
  return OUR_COMPONENT_DIRS.flatMap(sourceFiles).map((path) => ({
    path: path.replace(`${REPO_ROOT}/`, ''),
    code: withoutComments(readFileSync(path, 'utf8')),
  }));
}

describe('child data-slot variants are not written in reverse', () => {
  const sources = ourComponentSources();

  it('finds our component files, so a moved directory cannot pass vacuously', () => {
    expect(sources.length).toBeGreaterThan(30);
  });

  it('finds the correct form in use, so the pattern itself still matches something', () => {
    const usingCorrectForm = sources.filter(({ code }) => CORRECT.test(code));

    expect(usingCorrectForm.length).toBeGreaterThan(0);
  });

  it('has no class writing the attribute variant before the child selector', () => {
    const offenders = sources
      .filter(({ code }) => REVERSED.test(code))
      .map(({ path, code }) => `${path}: ${REVERSED.exec(code)?.[0]}`);

    expect(offenders).toEqual([]);
  });
});
