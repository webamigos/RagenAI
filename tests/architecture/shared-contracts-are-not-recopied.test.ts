import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Replaces `feature-keys-agree.test.ts` and `tenant-scope-guards-agree.test.ts`.
 *
 * Those compared hand-maintained copies of the same list across workspaces and
 * asserted they still matched. ADR-33 removed the copies: the LLM catalogue,
 * the feature flags, the MCP connector metadata and the tenant-scope model map
 * now live once, in `@ragenai/platform-contracts`, and each app holds a
 * re-export or a thin binding.
 *
 * So the invariant to enforce changed shape. It is no longer "the copies agree"
 * — it is "there is only one". This fails if any app declares one of these
 * contracts again, which is what someone reaches for when an import feels
 * awkward across a workspace boundary, and which is how the previous drift
 * started: apps/admin's model list had grown a provider prefix that matched no
 * LiteLLM model ID, so restricting an organization's models emptied its picker
 * instead of narrowing it.
 *
 * See docs/lessons/hand-copied-lists-drift-and-typecheck-only-sees-one.md.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const PACKAGE = join('packages', 'platform-contracts');

/**
 * Each contract, matched by its *declaration* rather than a mention. A file
 * importing or re-exporting `FEATURE_KEYS` is exactly what should happen; a
 * file assigning it a fresh array is the thing being forbidden.
 */
const CONTRACTS = [
  {
    name: 'FEATURE_KEYS',
    declaration: /\b(?:const|let|var)\s+FEATURE_KEYS\s*(?::[^=]+)?=\s*\[/,
  },
  {
    name: 'DEFAULT_FEATURES',
    declaration: /\b(?:const|let|var)\s+DEFAULT_FEATURES\s*(?::[^=]+)?=\s*\{/,
  },
  {
    name: 'FEATURE_LABELS',
    declaration: /\b(?:const|let|var)\s+FEATURE_LABELS\s*(?::[^=]+)?=\s*\{/,
  },
  {
    name: 'MODEL_REGISTRY',
    declaration: /\b(?:const|let|var)\s+MODEL_REGISTRY\s*(?::[^=]+)?=\s*\{/,
  },
  {
    name: 'CONNECTOR_PROVIDERS',
    declaration:
      /\b(?:const|let|var)\s+CONNECTOR_PROVIDERS\s*(?::[^=]+)?=\s*\[/,
  },
  {
    name: 'CONNECTOR_METADATA',
    declaration: /\b(?:const|let|var)\s+CONNECTOR_METADATA\s*(?::[^=]+)?=\s*\{/,
  },
  {
    name: 'TENANT_SCOPED_MODELS',
    declaration:
      /\b(?:const|let|var)\s+TENANT_SCOPED_MODELS\s*(?::[^=]+)?=\s*\{/,
  },
  /**
   * Added after `apps/admin`'s organizations actions were found holding a
   * fourth copy — `const ORG_ROLES = ['owner', 'admin', 'member'] as const`
   * with its own `OrgRole` derived from it. It survived the move of the role
   * vocabulary into the package (ADR-39) because the sibling test there forbids
   * comparing a role to a *literal*, and redeclaring the *list* is a different
   * shape of the same drift.
   */
  {
    name: 'ORG_ROLES',
    declaration: /\b(?:const|let|var)\s+ORG_ROLES\s*(?::[^=]+)?=\s*\[/,
  },
  /**
   * Added after `apps/admin/src/lib/auth-guard.ts` was found declaring
   * `APP_ADMIN_ROLE = 'admin'` beside the identical constant in the package.
   *
   * The copy was harmless in value and expensive in shape: `auth-guard.ts`
   * builds the whole Better Auth instance, so every consumer that reached it
   * for a five-character string paid several hundred milliseconds of module
   * graph. In tests that cost landed inside whichever case imported first,
   * and under `npm run verify`'s parallel load it crossed the 5s timeout —
   * a flaky failure naming an assertion-free test, three layers from its
   * cause. A re-export is fine; a second declaration is not.
   */
  {
    name: 'APP_ADMIN_ROLE',
    declaration: /\b(?:const|let|var)\s+APP_ADMIN_ROLE\s*(?::[^=]+)?=/,
  },
] as const;

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
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const files = [
  ...sourceFiles(join(REPO_ROOT, 'apps')),
  ...sourceFiles(join(REPO_ROOT, 'packages')),
].map((f) => ({
  path: relative(REPO_ROOT, f),
  source: readFileSync(f, 'utf8'),
}));

describe('shared platform contracts', () => {
  it('finds source files to scan, so this cannot pass on an empty sweep', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(CONTRACTS.map((c) => [c.name, c] as const))(
    '%s is declared only in packages/platform-contracts',
    (name, contract) => {
      const declaredIn = files
        .filter(({ source }) => contract.declaration.test(source))
        .map(({ path }) => path);

      const outside = declaredIn.filter((path) => !path.startsWith(PACKAGE));

      expect(
        outside,
        [
          `${name} is declared outside @ragenai/platform-contracts.`,
          '',
          'Import it instead. A second declaration cannot be kept in sync by',
          'typecheck — each copy derives its own types and stays internally',
          'consistent while disagreeing with the other app.',
        ].join('\n'),
      ).toEqual([]);

      // And it must still be declared *somewhere*: a rename that slips past
      // the regex would otherwise leave this passing while checking nothing.
      expect(declaredIn.length).toBeGreaterThan(0);
    },
  );

  it('is depended on by every app that consumes it', () => {
    const missing = ['web', 'api', 'admin'].filter((app) => {
      const pkg = JSON.parse(
        readFileSync(join(REPO_ROOT, 'apps', app, 'package.json'), 'utf8'),
      );
      return !pkg.dependencies?.['@ragenai/platform-contracts'];
    });

    expect(missing).toEqual([]);
  });
});
