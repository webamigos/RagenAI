import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `confirm()`, `alert()` and `prompt()` are not part of this interface.
 *
 * Five destructive actions were guarded by the browser's own `confirm()`:
 * removing a member from an organization, cancelling an invitation, archiving
 * a document, rejecting an invitation and rolling a document back to an
 * earlier version. Each one is unstyleable and untranslatable past the single
 * string it takes, ignores the dark theme, blocks the main thread, and names
 * the origin rather than the product.
 *
 * The part that makes it a correctness problem rather than a cosmetic one:
 * a browser that decides a page is showing too many dialogs offers to
 * suppress them, and a suppressed `confirm()` returns `false`. The guarded
 * action then silently never runs, and the only feedback is a row that did
 * not disappear.
 *
 * `@/app/components/ConfirmDialog` replaces all five — one dialog, themed,
 * translated, with the destructive styling in one place instead of pasted at
 * each call site.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * A bare call, or one through `window.` — but not `onConfirm(`,
 * `setConfirm(` or any other identifier that merely ends in the word.
 */
const NATIVE_DIALOG =
  /(?:^|[^.\w$])(?:window\s*\.\s*)?(?:confirm|alert|prompt)\s*\(/;

const APP_SOURCES = [
  'apps/web/src/**/*.{ts,tsx}',
  'apps/admin/src/**/*.{ts,tsx}',
];

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

function sourceFiles(): string[] {
  return APP_SOURCES.flatMap((pattern) => globSync(pattern, { cwd: REPO_ROOT }))
    .filter((f) => !f.includes('/generated/'))
    .filter((f) => !/\.(?:test|spec)\.tsx?$/.test(f));
}

describe('destructive actions do not use a native dialog', () => {
  const files = sourceFiles();

  it('finds the source it is meant to police', () => {
    // Guard on the guard: a glob that matches nothing passes silently.
    expect(files.length).toBeGreaterThan(400);
    expect(files.some((f) => f.includes('ConfirmDialog'))).toBe(true);
  });

  it('never calls confirm(), alert() or prompt()', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = stripCommentsAndStrings(
        readFileSync(join(REPO_ROOT, file), 'utf8'),
      );
      const lines = source.split('\n');
      lines.forEach((line, index) => {
        if (NATIVE_DIALOG.test(line)) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
    }

    expect(
      offenders,
      'A native dialog cannot be themed or translated, and a browser that ' +
        'suppresses it makes confirm() return false — so the guarded action ' +
        'silently never runs. Use @/app/components/ConfirmDialog.',
    ).toEqual([]);
  });

  it('catches the call it exists to catch, and spares the ones it should', () => {
    // The mutation, run against the pattern so the sweep above cannot pass
    // for the wrong reason.
    expect(NATIVE_DIALOG.test('if (!confirm(t("x"))) {')).toBe(true);
    expect(NATIVE_DIALOG.test('if (!window.confirm(msg)) {')).toBe(true);
    expect(NATIVE_DIALOG.test('  alert("done");')).toBe(true);

    // Names that merely end in the word are not calls to it.
    expect(NATIVE_DIALOG.test('onConfirm={() => run()}')).toBe(false);
    expect(NATIVE_DIALOG.test('setConfirmOpen(true);')).toBe(false);
    expect(NATIVE_DIALOG.test('await page.confirm();')).toBe(false);
  });
});
