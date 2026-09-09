import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Envelope encryption lives once, in `@ragenai/crypto` (ADR-02, ADR-06).
 *
 * It lived four times before that: apps/web, apps/api, apps/worker and a
 * partial copy in the worker's own utils. The copies were byte-compatible by
 * luck rather than by construction, and the two bugs that prompted the
 * extraction both came from one copy drifting:
 *
 * - the worker read `ENCRYPTION_MASTER_KEY` as base64 where the other three
 *   read hex, so a correctly configured deployment decrypted nothing (#979);
 * - `isEncryptionConfigured()` and `getKeyProvider()` disagreed about which
 *   providers counted, so a missing key fell through to plaintext instead of
 *   failing (#983).
 *
 * Neither is visible to typecheck. Each copy compiles, each is internally
 * consistent, and the disagreement only shows up as ciphertext one app cannot
 * read — at which point the data is already written.
 *
 * So the invariant is not "the copies agree", it is "there is only one". This
 * fails if any app builds a cipher, declares the provider interface, or
 * implements it again, which is what someone reaches for when importing across
 * a workspace boundary feels awkward.
 *
 * Same tripwire shape as `shared-contracts-are-not-recopied.test.ts`.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
/**
 * With the trailing separator. A bare `startsWith('packages/crypto')` also
 * exempts `packages/crypto-copy` — which is a fifth copy wearing a name that
 * makes the guard wave it through.
 */
const PACKAGE = join('packages', 'crypto') + sep;

/**
 * Matched by *construction* rather than by mention. Importing `KeyProvider`,
 * mocking `getKeyProvider()` in a test, or naming `createDecipheriv` in a
 * comment is all fine and common; assigning the interface a fresh declaration
 * or keying a fresh AES-GCM cipher is the thing being forbidden.
 */
const FORBIDDEN = [
  {
    name: 'the KeyProvider interface',
    pattern: /\b(?:interface|type)\s+KeyProvider\b/,
    instead: "import type { KeyProvider } from '@ragenai/crypto'",
  },
  {
    name: 'a KeyProvider implementation',
    pattern: /\bimplements\s+KeyProvider\b/,
    instead:
      'add the provider to packages/crypto/src/key-provider/ — a new KMS is one file there',
  },
  {
    name: 'an AES-GCM cipher',
    // Both spellings in full. `create(?:De)?cipheriv` looks equivalent and
    // is not: it misses `createCipheriv`, whose C is capital, so the guard
    // would have caught only the decrypting half.
    pattern: /\bcreate(?:Cipheriv|Decipheriv)\s*\(/,
    instead: "encryptContent()/decryptContent() from '@ragenai/crypto'",
  },
  {
    name: 'the AES-256-GCM algorithm literal',
    pattern: /['"`]aes-256-gcm['"`]/i,
    instead: "the algorithm is chosen once, in packages/crypto's envelope.ts",
  },
  {
    /**
     * The tell for a hand-rolled envelope even when the cipher itself is built
     * somewhere this sweep does not reach. The tag is the half that gets
     * dropped: a copy that forgets `setAuthTag` decrypts unauthenticated
     * ciphertext without complaining.
     */
    name: 'GCM authentication-tag handling',
    pattern: /\b(?:get|set)AuthTag\s*\(/,
    instead: "encryptContent()/decryptContent() from '@ragenai/crypto'",
  },
] as const;

/**
 * Empty, deliberately, and worth keeping as a place to record a decision
 * rather than deleting.
 *
 * The spec that planned this guard expected one entry: a worker test fixture
 * that built ciphers directly to produce a known payload. Phase D deleted that
 * fixture along with the copy it tested, so nothing needs an exemption today.
 * Adding one means arguing why a second cipher is correct — which is the
 * conversation this file exists to force.
 */
const ALLOWED: readonly string[] = [];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'generated',
  'coverage',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return SKIP_DIRS.has(entry) ? [] : sourceFiles(full);
    }
    // `.mts`/`.cts` too: the repository already has a `.mts` file, and a
    // copy this sweep does not open is a copy this guard cannot see.
    return /\.(?:[cm]?ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const files = [
  ...sourceFiles(join(REPO_ROOT, 'apps')),
  ...sourceFiles(join(REPO_ROOT, 'packages')),
].map((f) => ({
  path: relative(REPO_ROOT, f),
  source: readFileSync(f, 'utf8'),
}));

function offenders(pattern: RegExp): string[] {
  return files
    .filter(({ source }) => pattern.test(source))
    .map(({ path }) => path)
    .filter((path) => !path.startsWith(PACKAGE))
    .filter((path) => !ALLOWED.includes(path));
}

describe('envelope encryption', () => {
  it('finds source files to scan, so this cannot pass on an empty sweep', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('exempts the package, not everything named like it', () => {
    // The exemption is a path prefix, so it has to end at a directory
    // boundary. Without the separator, `packages/crypto-copy` — the most
    // likely name for the copy this file exists to forbid — is waved through.
    expect(join('packages', 'crypto', 'src', 'envelope.ts')).toContain(PACKAGE);
    expect(join('packages', 'crypto-copy', 'src', 'envelope.ts')).not.toContain(
      PACKAGE,
    );
  });

  it.each(FORBIDDEN.map((f) => [f.name, f] as const))(
    '%s appears only in packages/crypto',
    (name, { pattern, instead }) => {
      expect(
        offenders(pattern),
        [
          `${name} is declared outside @ragenai/crypto.`,
          '',
          `Use ${instead}.`,
          '',
          'A second copy cannot be kept in sync by typecheck: each one',
          'compiles and stays internally consistent while disagreeing with',
          'the others about the master-key encoding or which providers count',
          'as configured. That disagreement surfaces as ciphertext one app',
          'cannot read, after it is written.',
        ].join('\n'),
      ).toEqual([]);

      // And it must still appear *inside* the package: a rename that slipped
      // past the pattern would leave this passing while checking nothing.
      expect(
        files.some(
          ({ path, source }) =>
            path.startsWith(PACKAGE) && pattern.test(source),
        ),
        `${name} matches nothing in ${PACKAGE} either — the pattern has gone stale.`,
      ).toBe(true);
    },
  );

  /**
   * The other AES in this repository, and the reason these patterns match
   * construction rather than the word "AES".
   *
   * Organization API keys are encrypted with `crypto-js` — a different
   * algorithm, a different key, a different lifetime, and nothing to do with
   * thread messages or document content. Broadening any pattern above to
   * `/AES/i` would catch these four files and push someone toward "fixing"
   * them by routing API keys through the envelope helpers, which would be a
   * migration, not a cleanup.
   */
  it('does not catch the crypto-js API-key hash', () => {
    // Built with `join`, because the paths they are compared against come
    // from `relative()` and carry the platform's separator.
    const apiKeyHashers = [
      join('apps', 'web', 'src', 'app', 'lib', 'utils', 'hashApiKey.ts'),
      join('apps', 'api', 'src', 'organizations', 'hash-api-key.ts'),
      join('apps', 'web', 'src', 'scripts', 'backfill-teams-for-orgs.ts'),
      join('apps', 'web', 'src', 'scripts', 'migrate-litellm-teams.ts'),
    ];

    for (const path of apiKeyHashers) {
      const file = files.find((f) => f.path === path);

      expect(file, `${path} has moved; update this list`).toBeDefined();
      expect(file!.source).toMatch(/\bAES\.(?:en|de)crypt\s*\(/);

      for (const { name, pattern } of FORBIDDEN) {
        expect(
          pattern.test(file!.source),
          `${path} trips "${name}", but crypto-js API-key encryption is a separate concern`,
        ).toBe(false);
      }
    }
  });

  it('is depended on by every app that uses it', () => {
    const missing = ['web', 'api', 'worker'].filter((app) => {
      const pkg = JSON.parse(
        readFileSync(join(REPO_ROOT, 'apps', app, 'package.json'), 'utf8'),
      ) as { dependencies?: Record<string, string> };
      return !pkg.dependencies?.['@ragenai/crypto'];
    });

    expect(missing).toEqual([]);
  });
});
