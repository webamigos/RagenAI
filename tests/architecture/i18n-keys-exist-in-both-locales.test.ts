import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A translation key called in a component but missing from one locale renders
 * as the raw key for users of that language. There was one: English users hit
 * `ErrorBoundary.file-error-fetching` and saw the key, because it existed only
 * in pl.json. Comparing the two files by hand does not find that — the files
 * were nearly the same size, and eleven keys differed of which only one was
 * actually called.
 *
 * Deliberately narrow, so it has no false positives:
 *
 *   - only `.tsx` files with exactly **one** `useTranslations('ns')`, so the
 *     namespace of a `t()` call is unambiguous (168 of 193 such files);
 *   - only `t('literal')` calls. Dynamic keys — `t(`severity.${x}`)` — cannot
 *     be resolved statically and are skipped rather than guessed at.
 *
 * The consequence of that narrowness is worth stating: this does not prove a
 * key is unused, so it must not be used to delete keys. It proves that what is
 * statically called exists in both locales.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const MESSAGES = join(REPO_ROOT, 'apps/web/src/app/messages');
const LOCALES = ['en', 'pl'] as const;

const NAMESPACE = /useTranslations\(\s*['"]([^'"]+)['"]/g;
const CALL = /\bt\(\s*['"]([^'"]+)['"]/g;

function flatten(value: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>();
  if (value === null || typeof value !== 'object') {
    return keys;
  }
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (nested !== null && typeof nested === 'object') {
      for (const deeper of flatten(nested, path)) {
        keys.add(deeper);
      }
    } else {
      keys.add(path);
    }
  }
  return keys;
}

function localeKeys(locale: string): Set<string> {
  return flatten(
    JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), 'utf8')),
  );
}

type Call = { key: string; file: string };

function staticallyResolvableCalls(): Call[] {
  const files = globSync('apps/web/src/**/*.tsx', { cwd: REPO_ROOT }).filter(
    (path) => !path.includes('/generated/'),
  );

  const calls: Call[] = [];
  for (const file of files) {
    const source = readFileSync(join(REPO_ROOT, file), 'utf8');
    const namespaces = new Set(
      [...source.matchAll(NAMESPACE)].map(([, ns]) => ns),
    );
    if (namespaces.size !== 1) {
      continue;
    }
    const [namespace] = namespaces;
    for (const [, leaf] of source.matchAll(CALL)) {
      calls.push({ key: `${namespace}.${leaf}`, file });
    }
  }
  return calls;
}

describe('translation keys called from components', () => {
  it('exist in every locale', () => {
    const keys = Object.fromEntries(
      LOCALES.map((locale) => [locale, localeKeys(locale)]),
    );

    const missing = staticallyResolvableCalls()
      .map(({ key, file }) => ({
        key,
        file,
        absentFrom: LOCALES.filter((locale) => !keys[locale].has(key)),
      }))
      // Absent from every locale means the key was never added at all, which
      // is a different bug and one `next-intl` surfaces loudly at runtime.
      // This is about the asymmetry, which is silent for half the users.
      .filter(({ absentFrom }) => absentFrom.length === 1);

    expect(
      missing,
      missing.length === 0
        ? ''
        : [
            'A key is called in a component but missing from one locale, so',
            'users of that language see the raw key:',
            '',
            ...missing.map(
              (m) => `  ${m.key} — missing from ${m.absentFrom[0]} (${m.file})`,
            ),
          ].join('\n'),
    ).toEqual([]);
  });

  it('resolve enough calls for this to be checking something', () => {
    expect(staticallyResolvableCalls().length).toBeGreaterThan(500);
  });
});
