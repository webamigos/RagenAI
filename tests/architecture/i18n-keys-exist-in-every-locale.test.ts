import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { locales as LOCALES } from '../../apps/web/src/app/config';

import { trackedFiles } from './tracked-files';

/**
 * A translation key called in a component but missing from a locale renders as
 * the raw key for users of that language. There was one: English users hit
 * `ErrorBoundary.file-error-fetching` and saw the key, because it existed only
 * in pl.json. Comparing the files by hand does not find that — they were nearly
 * the same size, and eleven keys differed of which only one was actually called.
 *
 * The locales are the ones `apps/web/src/app/config.ts` declares, read from
 * there rather than listed here. This used to say `['en', 'pl']` while the app
 * shipped fifteen, so the bug it was written to prevent was unguarded for
 * thirteen of the languages a user could select (#1097); a new language added
 * to the config is now in scope the moment it is added.
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
 * statically called exists in every locale.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const MESSAGES = join(REPO_ROOT, 'apps/web/src/app/messages');

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
  const files = trackedFiles({
    under: 'apps/web/src',
    extensions: ['.tsx'],
    relativePaths: true,
  }).filter((path) => !path.includes('/generated/'));

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
  it('has a messages file for every locale in the config, and no other', () => {
    const files = readdirSync(MESSAGES)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
      .sort();

    expect(files).toEqual([...LOCALES].sort());
  });

  it('exist in every locale', () => {
    const keys = Object.fromEntries(
      LOCALES.map((locale) => [locale, localeKeys(locale)]),
    );

    const missingByLocale = new Map<string, Map<string, string>>();

    for (const { key, file } of staticallyResolvableCalls()) {
      const absentFrom = LOCALES.filter((locale) => !keys[locale].has(key));

      // Absent from every locale means the key was never added at all, which
      // is a different bug and one `next-intl` surfaces loudly at runtime.
      // This is about the asymmetry, which is silent for some of the users.
      if (absentFrom.length === 0 || absentFrom.length === LOCALES.length) {
        continue;
      }

      for (const locale of absentFrom) {
        const forLocale = missingByLocale.get(locale) ?? new Map();
        forLocale.set(key, file);
        missingByLocale.set(locale, forLocale);
      }
    }

    // Per locale, because "de is missing 4 keys" is something a person can act
    // on and "some locale is missing something" is not.
    const report = [...missingByLocale]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([locale, missing]) =>
        [
          `${locale} is missing ${missing.size} key${missing.size === 1 ? '' : 's'}:`,
          ...[...missing].map(([key, file]) => `    ${key} (${file})`),
        ].join('\n'),
      );

    expect(
      report,
      report.length === 0
        ? ''
        : [
            'A key is called in a component but missing from a locale, so users',
            'of that language see the raw key:',
            '',
            ...report,
          ].join('\n'),
    ).toEqual([]);
  });

  it('resolve enough calls for this to be checking something', () => {
    expect(staticallyResolvableCalls().length).toBeGreaterThan(500);
  });
});
