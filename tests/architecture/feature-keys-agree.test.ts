import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The feature-flag key list exists three times — `apps/web` owns the contract,
 * `apps/api` has a port of it (see
 * docs/adrs/21-monorepo-and-api-decoupling.md), and `apps/admin` has its own
 * copy because it is the UI that sets the per-org overrides. There is no
 * shared package for it.
 *
 * Every copy fails differently when it drifts, and none of them fail loudly:
 *
 *   - missing in `apps/api` → the NestJS gate for that feature reads
 *     `undefined` and the flag stops being enforced on the public API path,
 *   - missing in `apps/admin` → the key never renders a control, so a platform
 *     admin has no way to turn the feature on for an organization and the
 *     feature is simply dead for everyone,
 *   - missing in `apps/web` → nothing gates the in-app surface.
 *
 * Typecheck cannot catch any of these: each app derives its own `FeatureKey`
 * union from its own array, so all three stay internally consistent while
 * disagreeing with each other.
 *
 * This compares the key sets only. `DEFAULT_FEATURES` is deliberately not
 * compared — `apps/admin` has no defaults (it only writes overrides), and the
 * web/api defaults are asserted to match in the second test below, where a
 * mismatch means the same organization gets a different answer depending on
 * which app it asks.
 */

const SOURCES = {
  web: 'apps/web/src/features/subscriptions/contracts/features.types.ts',
  api: 'apps/api/src/subscriptions/types.ts',
  admin: 'apps/admin/src/app/(dashboard)/features/feature-keys.ts',
} as const;

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** The `'inviteMembers',` entries inside `export const FEATURE_KEYS = [ … ]`. */
function featureKeys(relativePath: string): string[] {
  const source = read(relativePath);
  const block = /export const FEATURE_KEYS = \[([\s\S]*?)\] as const;/.exec(
    source,
  );

  if (!block) {
    throw new Error(
      `No FEATURE_KEYS array found in ${relativePath}. If it was renamed or ` +
        'reshaped, update this guard — do not delete it.',
    );
  }

  return [...block[1].matchAll(/'([A-Za-z0-9_]+)'/g)]
    .map(([, key]) => key)
    .sort();
}

/** The `inviteMembers: false,` entries inside `DEFAULT_FEATURES`. */
function defaultFeatures(relativePath: string): Record<string, boolean> {
  const source = read(relativePath);
  const block =
    /export const DEFAULT_FEATURES: FeatureFlags = \{([\s\S]*?)\};/.exec(
      source,
    );

  if (!block) {
    throw new Error(
      `No DEFAULT_FEATURES object found in ${relativePath}. If it was renamed ` +
        'or reshaped, update this guard — do not delete it.',
    );
  }

  return Object.fromEntries(
    [...block[1].matchAll(/([A-Za-z0-9_]+):\s*(true|false)/g)].map(
      ([, key, value]) => [key, value === 'true'],
    ),
  );
}

describe('the three feature-key lists', () => {
  it('contain the same keys', () => {
    const web = featureKeys(SOURCES.web);

    for (const [app, path] of Object.entries(SOURCES)) {
      if (app === 'web') {
        continue;
      }

      expect(
        featureKeys(path),
        [
          `The feature-key lists have drifted: ${app} does not match web.`,
          '',
          ...Object.values(SOURCES).map((p) => `  ${p}`),
          '',
          'A key missing from apps/api leaves that feature unenforced on the',
          'public API path; missing from apps/admin, no platform admin can',
          'turn it on for an organization. Add it to all three.',
        ].join('\n'),
      ).toEqual(web);
    }
  });

  it('agree on the code defaults shared by web and api', () => {
    // apps/admin has no defaults — it only writes per-org overrides.
    expect(
      defaultFeatures(SOURCES.api),
      [
        'web and api disagree on DEFAULT_FEATURES. The same organization then',
        'gets a different answer depending on which app resolves the flag —',
        'a feature off in the app but on over the public API, or the reverse.',
      ].join('\n'),
    ).toEqual(defaultFeatures(SOURCES.web));
  });

  it('parse to something, so a rewrite cannot leave this checking nothing', () => {
    // If a file is reformatted past what the regexes match, both sides of a
    // comparison become empty and it passes while testing nothing.
    expect(featureKeys(SOURCES.web).length).toBeGreaterThan(4);
    expect(Object.keys(defaultFeatures(SOURCES.web)).length).toBeGreaterThan(4);
  });
});
