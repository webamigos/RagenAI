import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The storage join and the AI-usage `_sum` selection live once, in
 * `@ragenai/platform-contracts` (ADR-35).
 *
 * They were written twice before that — apps/web's own storage view and
 * apps/admin's disk-usage page — and the two copies disagreed about the
 * `_count` shape, the field names and whether a usage percentage existed at
 * all. Typecheck saw none of it: each copy built its own object literal.
 *
 * This is the same tripwire shape as `shared-contracts-are-not-recopied`:
 * the invariant is not "the copies agree", it is "there is only one".
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/**
 * Each file, and the join it must import rather than rebuild.
 *
 * apps/web dropped out of the organization-level join when ADR-35's third
 * rule removed its cross-organization branch — that read belongs to the
 * panel, so apps/web now only joins projects within one organization.
 */
const CONSUMERS = [
  {
    path: 'apps/admin/src/app/(dashboard)/disk-usage/page.tsx',
    imports: 'joinOrgStorage',
  },
  {
    path: 'apps/web/src/features/organizations/services/queries/get-admin-storage-query.ts',
    imports: 'joinProjectStorage',
  },
];

const AI_USAGE_CONSUMERS = ['apps/admin/src/app/(dashboard)/ai-usage/page.tsx'];

function read(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), 'utf8');
}

describe('the storage join', () => {
  it.each(CONSUMERS)(
    '$path imports $imports rather than rebuilding it',
    ({ path, imports }) => {
      const source = read(path);

      expect(source).toMatch(
        new RegExp(
          `import \\{[\\s\\S]*?${imports}[\\s\\S]*?\\} from '@ragenai/platform-contracts'`,
        ),
      );
    },
  );

  /**
   * The specific shape both copies had: a `Map` from organization id to a
   * usage object, built inline from a `groupBy` result. Finding one again
   * means somebody has re-derived the join instead of calling it.
   */
  it.each(CONSUMERS)('$path no longer builds its own usage map', ({ path }) => {
    const source = read(path);

    expect(source).not.toMatch(/new Map\([\s\S]{0,80}_sum\.fileSize/);
  });

  it.each(CONSUMERS)('$path does not recompute the percentage', ({ path }) => {
    const source = read(path);

    // `(usage / limit) * 100` in any spelling.
    expect(source).not.toMatch(/\/\s*limit\s*\)\s*\*\s*100/);
  });
});

describe('the AI-usage sum selection', () => {
  it.each(AI_USAGE_CONSUMERS)('%s uses the shared field set', (path) => {
    const source = read(path);

    expect(source).toContain('AI_USAGE_SUM_FIELDS');
    // The literal it replaced. Re-spelling it by hand is how one field goes
    // missing and a cell silently renders zero.
    expect(source).not.toMatch(/_sum:\s*\{[\s\S]{0,120}inputTokens:\s*true/);
  });
});
