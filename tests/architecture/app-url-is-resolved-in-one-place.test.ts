import { describe, expect, it } from 'vitest';

import { readSource, trackedFiles } from './tracked-files';

/**
 * The installation's public origin is read through `resolveAppUrl()` and
 * nowhere else.
 *
 * `APP_URL` replaced `BETTER_AUTH_URL`
 * (docs/specs/2026-10-18-app-url-replaces-better-auth-url.md). The old name
 * is no longer read as a value; `appUrlRenameRule` reads it only to tell an
 * install to rename it, and that rule lives in the same file. Before that,
 * three files read the origin by hand and disagreed on which name won — emails
 * and the browser could point at different hosts. One reader keeps it that
 * way, and keeps the old name from creeping back in as a quiet fallback.
 *
 * A *read* is what is policed: `process.env.BETTER_AUTH_URL`,
 * `env['BETTER_AUTH_URL']`, or the name as a string literal handed to a
 * lookup. Comments, the schema key in `fragments.ts` that lets the rule see
 * the old name, and tests (which must prove it is ignored) are not reads.
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

  it('reads BETTER_AUTH_URL only inside app-url.ts, to report the rename', () => {
    const offenders = files
      .filter((file) => file !== RESOLVER)
      .filter((file) => {
        const text = code(readSource(file));
        return LEGACY_READ.some((pattern) => pattern.test(text));
      });

    expect(
      offenders,
      'Read the public origin with `resolveAppUrl()` from @ragenai/env. ' +
        'BETTER_AUTH_URL was renamed to APP_URL and must not come back as a ' +
        'fallback.',
    ).toEqual([]);
  });
});
