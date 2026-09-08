import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A demo password belongs in the environment, never in the repository.
 *
 * This is the same shape as the Google Tag Manager container id that used to
 * sit in `[locale]/layout.tsx`: a vendor-specific literal in an Apache-2.0
 * repository, harmless-looking, and shipped to everyone who clones it. A
 * credential is worse, because it keeps working after someone notices.
 *
 * `libs/demo-credentials.ts` reads `NEXT_PUBLIC_DEMO_EMAIL` and
 * `NEXT_PUBLIC_DEMO_PASSWORD` and returns nothing when either is missing, so
 * a self-hosted build renders no box at all. The presence of the two
 * variables is the gate rather than `TARGET_ENV === 'demo'` — `libs/utils/env.ts`
 * warns against that after the tag-manager incident, since `TARGET_ENV`
 * cannot answer "is this the vendor's own deployment", and a self-hoster
 * standing up a showcase instance might reasonably set it to `demo`.
 *
 * See docs/lessons/a-hardcoded-analytics-id-tracks-every-self-hoster.md.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const READER = 'apps/web/src/libs/demo-credentials.ts';

/**
 * Anything shaped like the credential this feature publishes. The address is
 * matched on its own because it is the half that identifies the account, and
 * the password pattern catches the specific literal in circulation plus the
 * obvious variants of it.
 */
const DEMO_CREDENTIAL = [
  /\bdemo@ragen\.ai\b/i,
  /\bAdmin123[#!@$]?/,
  /NEXT_PUBLIC_DEMO_PASSWORD\s*(?:\|\||\?\?)\s*['"]/,
];

function sourceFiles(): string[] {
  return ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}']
    .flatMap((pattern) => globSync(pattern, { cwd: REPO_ROOT }))
    .filter((f) => !f.includes('/generated/'));
}

describe('demo credentials are not hardcoded', () => {
  const files = sourceFiles();

  it('reads the source it is meant to police', () => {
    // Guard on the guard: an empty sweep would pass every case below.
    expect(files.length).toBeGreaterThan(400);
    expect(files).toContain(READER);
  });

  it('appear in no source file, not even a test fixture', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8');
      for (const pattern of DEMO_CREDENTIAL) {
        if (pattern.test(source)) {
          offenders.push(`${file} — ${pattern}`);
        }
      }
    }

    expect(
      offenders,
      'Put the value in NEXT_PUBLIC_DEMO_EMAIL / NEXT_PUBLIC_DEMO_PASSWORD on ' +
        'the deployment that offers the account. A credential committed here ' +
        'ships to everyone who clones the repository.',
    ).toEqual([]);
  });

  it('are read from the environment, with no fallback', () => {
    const reader = readFileSync(join(REPO_ROOT, READER), 'utf8');

    expect(reader).toMatch(/process\.env\.NEXT_PUBLIC_DEMO_EMAIL/);
    expect(reader).toMatch(/process\.env\.NEXT_PUBLIC_DEMO_PASSWORD/);
    // Returning null when either is absent is what keeps the box off a
    // self-hosted build.
    expect(reader).toMatch(/return null/);
  });

  it('catches what it exists to catch', () => {
    // The mutation, against the patterns, so the sweep cannot pass vacuously.
    expect(
      DEMO_CREDENTIAL.some((p) => p.test("const email = 'demo@ragen.ai';")),
    ).toBe(true);
    expect(DEMO_CREDENTIAL.some((p) => p.test('password: "Admin123#"'))).toBe(
      true,
    );
    expect(
      DEMO_CREDENTIAL.some((p) =>
        p.test("process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? 'Admin123#'"),
      ),
    ).toBe(true);

    // And spares the legitimate reads.
    expect(
      DEMO_CREDENTIAL.some((p) =>
        p.test('process.env.NEXT_PUBLIC_DEMO_PASSWORD?.trim()'),
      ),
    ).toBe(false);
  });
});
