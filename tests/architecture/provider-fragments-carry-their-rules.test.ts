import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A provider fragment is meaningless without its rule, so merging one without
 * calling the other is a bug the type system cannot see.
 *
 * `fragments.storage` and `fragments.encryption` declare every credential
 * optional, because which ones are mandatory depends on which provider was
 * picked. That is the only shape a shared fragment can have. It also means a
 * schema that merges one and stops there validates nothing beyond the types —
 * and it *looks* validated, which is the dangerous part.
 *
 * This is not hypothetical. When the rules were lifted into the package, two
 * of the three apps merging these fragments had paired neither:
 *
 * - apps/web merged `storage` and `encryption` and called
 *   `requiredForProvider` not once, so `STORAGE_PROVIDER=s3` with no bucket
 *   parsed clean;
 * - apps/api merged `encryption` and validated none of it;
 * - apps/worker paired both — and had written the rules in the first place,
 *   after an unconstructable encryption provider silently downgraded PII
 *   ingest to masked-only on every document.
 *
 * So the same configuration was a boot failure in one app and a clean parse in
 * another, which is precisely what a shared contract exists to prevent.
 *
 * The invariant: if a file merges the fragment, it calls the rule. Whether it
 * calls the rule directly or through `superRefine` is not this test's
 * business — only that the pairing is present in the same file.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const SEARCH_ROOTS = ['apps', 'packages'];

/** The package that defines both halves is allowed to mention either. */
const EXEMPT = [join('packages', 'env') + sep];

const PAIRINGS = [
  {
    fragment: 'storage',
    rule: 'storageRules',
    consequence:
      'STORAGE_PROVIDER=s3 with no bucket, region or credentials would parse clean and fail at the first upload',
  },
  {
    fragment: 'encryption',
    rule: 'encryptionRules',
    consequence:
      'a chosen ENCRYPTION_PROVIDER with no key would read as "encryption not configured" — which silently downgraded PII ingest to masked-only once already',
  },
] as const;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.tsx?$/.test(full)) {
      yield full;
    }
  }
}

const sourceFiles = SEARCH_ROOTS.flatMap((root) => {
  const full = join(REPO_ROOT, root);
  try {
    return [...walk(full)];
  } catch {
    return [];
  }
}).filter((file) => {
  const rel = relative(REPO_ROOT, file);
  return !EXEMPT.some((prefix) => rel.startsWith(prefix));
});

describe('a provider fragment is merged with the rule that gives it meaning', () => {
  it.each(PAIRINGS)(
    'every schema merging fragments.$fragment also calls $rule',
    ({ fragment, rule, consequence }) => {
      // `.merge(fragments.storage)` and `fragments.storage.superRefine(...)`
      // both count as merging it; a bare mention in a comment does not.
      const merges = new RegExp(
        `fragments\\s*\\.\\s*${fragment}\\b|\\bmerge\\s*\\(\\s*${fragment}\\b`,
      );
      const calls = new RegExp(`\\b${rule}\\s*\\(`);

      const unpaired = sourceFiles
        .filter((file) => {
          const source = readFileSync(file, 'utf8');
          return merges.test(source) && !calls.test(source);
        })
        .map((file) => relative(REPO_ROOT, file));

      expect(
        unpaired,
        `These files merge fragments.${fragment} without calling ${rule}(env, ctx), so ${consequence}.`,
      ).toEqual([]);
    },
  );

  it('finds the schemas it is supposed to be guarding', () => {
    // A walk that silently matched nothing would make every assertion above
    // pass for the wrong reason.
    const merging = sourceFiles.filter((file) =>
      /fragments\s*\.\s*(?:storage|encryption)\b/.test(
        readFileSync(file, 'utf8'),
      ),
    );

    expect(merging.length).toBeGreaterThanOrEqual(3);
  });
});
