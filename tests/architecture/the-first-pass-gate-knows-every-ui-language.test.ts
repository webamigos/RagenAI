import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT, readSource, trackedFiles } from './tracked-files';

/**
 * The basal first pass's language gate, and the one door to basal.
 *
 * The gate restricts its detector (eld) to the languages the panel ships a UI
 * for, so a German message reads as German rather than as whichever of Polish
 * and English it is nearer to. That list is a hand copy of `locales` in
 * apps/web, in eld's codes, and a locale added to the panel and not to the
 * gate is a language the detector can no longer name — its messages
 * land on a neighbour, which may be Polish or English, and basal clears text
 * it was never trained on. Same shape as
 * `hand-copied-lists-drift-and-typecheck-only-sees-one.md`.
 */

/** The panel's locales to eld's codes: the same ISO 639-1, except Bokmål. */
const ELD_CODE: Record<string, string> = {
  en: 'en',
  pl: 'pl',
  es: 'es',
  de: 'de',
  fr: 'fr',
  pt: 'pt',
  it: 'it',
  hu: 'hu',
  bg: 'bg',
  uk: 'uk',
  da: 'da',
  sv: 'sv',
  fi: 'fi',
  cs: 'cs',
  sk: 'sk',
  nl: 'nl',
  nb: 'no',
};

function listIn(source: string, name: string): string[] {
  const block = source.match(
    new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`),
  );
  expect(
    block,
    `${name} is no longer an array literal; update this guard`,
  ).not.toBeNull();
  return [...block![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
}

describe('the first-pass language gate', () => {
  const locales = listIn(
    readFileSync(
      join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'config.ts'),
      'utf8',
    ),
    'locales',
  );
  const gate = listIn(
    readFileSync(
      join(
        REPO_ROOT,
        'packages',
        'guardrails',
        'src',
        'evaluator',
        'first-pass.ts',
      ),
      'utf8',
    ),
    'FIRST_PASS_DETECTABLE_LANGUAGES',
  );

  it('can name every language the panel has a locale for', () => {
    expect(locales.length).toBeGreaterThan(10);
    for (const locale of locales) {
      expect(
        ELD_CODE[locale],
        `apps/web gained the locale "${locale}"; add its eld code here and to FIRST_PASS_DETECTABLE_LANGUAGES`,
      ).toBeDefined();
    }
    expect([...gate].sort()).toEqual(
      locales.map((locale) => ELD_CODE[locale]).sort(),
    );
  });
});

describe('basal is asked through one client', () => {
  it('nothing outside packages/basal-client calls /v1/systemone', () => {
    // The client is where the timeout, the breaker and the strict parsing
    // live. A second caller would have none of them, and a malformed answer
    // read as a low P(attack) clears a rule.
    const offenders = trackedFiles({
      under: ['apps', 'packages'],
      extensions: ['.ts', '.tsx', '.js', '.mjs'],
      skipDirs: ['node_modules', 'dist', '.next', '__tests__', '__mocks__'],
    }).filter(
      (file) =>
        !relative(REPO_ROOT, file).startsWith('packages/basal-client/') &&
        readSource(file).includes('/v1/systemone'),
    );

    expect(offenders.map((f) => relative(REPO_ROOT, f))).toEqual([]);
  });
});
