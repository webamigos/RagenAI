import { describe, expect, it } from 'vitest';

import { readSource, trackedFiles } from './tracked-files';

/**
 * The installation's public origin is read through `resolveAppUrl()` and
 * nowhere else.
 *
 * `APP_URL` replaced `BETTER_AUTH_URL`, which is still accepted as a fallback
 * so no deployment had to be reconfigured at once
 * (docs/specs/2026-10-18-app-url-replaces-better-auth-url.md). Before that,
 * three files read the origin by hand and disagreed on which name won — emails
 * and the browser could point at different hosts. One reader is what makes
 * the order the same everywhere, and what makes dropping the old name later a
 * one-line change rather than a hunt.
 *
 * A *read* is what is policed: `process.env.BETTER_AUTH_URL`,
 * `env['BETTER_AUTH_URL']`, or the name as a string literal handed to a
 * lookup. Comments, the schema key in `fragments.ts` that lets a legacy
 * install validate, and tests (which must exercise the fallback) are not
 * reads.
 */

const RESOLVER = 'packages/env/src/app-url.ts';

const LEGACY_READ = [
  /\.BETTER_AUTH_URL\b/,
  /\[\s*['"`]BETTER_AUTH_URL['"`]\s*\]/,
  /['"`]BETTER_AUTH_URL['"`]/,
];

function sources(): string[] {
  return trackedFiles({
    under: ['apps', 'packages'],
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js'],
    relativePaths: true,
  }).filter(
    (f) =>
      /^(?:apps|packages)\/[^/]+\/src\//.test(f) &&
      !f.includes('/__tests__/') &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f) &&
      !f.includes('/generated/'),
  );
}

/** The source with comments blanked out, so prose naming the variable passes. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the app origin is resolved in one place', () => {
  const files = sources();

  it('reads the source it is meant to police', () => {
    // Guard on the guard: an empty sweep would pass the case below.
    expect(files.length).toBeGreaterThan(400);
    expect(files).toContain(RESOLVER);
  });

  it('reads BETTER_AUTH_URL only inside resolveAppUrl()', () => {
    const offenders = files
      .filter((file) => file !== RESOLVER)
      .filter((file) => {
        const text = code(readSource(file));
        return LEGACY_READ.some((pattern) => pattern.test(text));
      });

    expect(
      offenders,
      'Read the public origin with `resolveAppUrl()` from @ragenai/env — it ' +
        'takes APP_URL first and the deprecated BETTER_AUTH_URL second, the ' +
        'same order in every app.',
    ).toEqual([]);
  });
});
