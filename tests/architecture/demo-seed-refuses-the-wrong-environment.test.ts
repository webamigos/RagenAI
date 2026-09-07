import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The demo seed must decide *which database this is* before it touches one.
 *
 * This is an architecture test rather than a unit test because of where the
 * script lives: `apps/web/tsconfig.json` excludes `src/scripts`, so nothing in
 * that directory is typechecked. A rename could leave the import dangling and
 * `npm run verify` would stay green. The script also cannot be executed here —
 * its import chain pulls in `crypto-js` and the app logger, which fail under
 * plain ESM before `main()` is reached — so reading the source is the only
 * check available.
 *
 * What it protects: the script applies the demo restrictions to an
 * organization found *by slug* in whatever database `DATABASE_URL` names.
 * `@ragenai/env` validates that the URL is a URL, not which database it
 * reaches. A stale value in a shell plus a matching slug silently freezes a
 * real organization — documents and settings locked, a spend cap applied — and
 * looks like success.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SEED = 'apps/web/src/scripts/seed-demo-organization.ts';

function seedSource(): string {
  return readFileSync(join(REPO_ROOT, SEED), 'utf8');
}

describe('the demo seed refuses the wrong environment', () => {
  const source = seedSource();
  const mainStart = source.indexOf('async function main()');

  it('has a main() to inspect, so a rewrite cannot pass vacuously', () => {
    expect(mainStart).toBeGreaterThan(-1);
  });

  it('imports the guard from a typechecked module', () => {
    // Not defined inline: `src/scripts` is not typechecked, so the logic and
    // its tests have to live somewhere that is.
    expect(source).toMatch(
      /import \{[\s\S]*?assertDemoSeedTarget[\s\S]*?\} from '@\/features\/subscriptions\/services\/assert-demo-seed-target'/,
    );
  });

  /**
   * `main()` reaches the database through helpers rather than `db.` directly,
   * so the ordering is expressed against those calls. An earlier version of
   * this test searched for `db.` inside `main` and found nothing, then passed
   * its own emptiness off as agreement — which is why the assertions below
   * insist each landmark exists before comparing positions.
   */
  it.each([
    ['resolveOrganization(', 'the first read'],
    ['parseArgs(', 'even argument parsing'],
  ])('calls the guard before %s', (landmark) => {
    const body = source.slice(mainStart);
    const guardAt = body.indexOf('assertDemoSeedTarget(');
    const landmarkAt = body.indexOf(landmark);

    expect(guardAt).toBeGreaterThan(-1);
    expect(
      landmarkAt,
      `${SEED} no longer calls ${landmark} in main(), so this test is measuring nothing. Update the landmark rather than deleting the check.`,
    ).toBeGreaterThan(-1);
    expect(
      guardAt,
      `${SEED} reaches ${landmark} before asserting which environment it is in. The order is the guard — refusing after a read is still refusing after having read the wrong database.`,
    ).toBeLessThan(landmarkAt);
  });

  it('passes the real process values, not a hardcoded pair', () => {
    const body = source.slice(mainStart);

    expect(body).toContain('process.env.TARGET_ENV');
    expect(body).toContain('process.argv');
  });
});
