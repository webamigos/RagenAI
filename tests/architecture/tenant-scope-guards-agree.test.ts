import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The tenant-scope guard exists twice — once for `apps/web`, once for
 * `apps/api` — because there is no shared package for it yet. AGENTS.md says to
 * "keep both in sync by hand", and a rule kept by hand is a rule that drifts:
 * a model added to one list is silently unguarded in the other app, and the
 * whole point of the guard is catching a query that forgot its org scope.
 *
 * This compares the two lists. It does not check the guard logic — only that
 * both apps agree on which models are tenant-scoped and on the column each one
 * uses. `DocumentCitation` is the naming outlier (`orgId`, not
 * `organizationId`), which is exactly the kind of detail that gets copied
 * wrong.
 */

const GUARDS = {
  web: 'apps/web/src/libs/db/tenant-scope-guard.ts',
  api: 'apps/api/src/prisma/tenant-scope-guard.ts',
} as const;

/** `  Thread: 'organizationId',` → `['Thread', 'organizationId']` */
const SCOPED_MODEL = /^\s{2}(\w+):\s*'(organizationId|orgId)',?\s*$/gm;

function scopedModels(relativePath: string): Record<string, string> {
  const source = readFileSync(
    join(import.meta.dirname, '..', '..', relativePath),
    'utf8',
  );

  return Object.fromEntries(
    [...source.matchAll(SCOPED_MODEL)].map(([, model, column]) => [
      model,
      column,
    ]),
  );
}

describe('the two tenant-scope guards', () => {
  it('cover the same models, with the same org column', () => {
    const web = scopedModels(GUARDS.web);
    const api = scopedModels(GUARDS.api);

    expect(
      api,
      [
        'The tenant-scope guards have drifted. A model guarded in one app and',
        'not the other is unguarded wherever it is missing, and that guard is',
        'what catches a query with no org scope — the cross-org IDOR class.',
        '',
        `  ${GUARDS.web}`,
        `  ${GUARDS.api}`,
        '',
        'Add the model to both, with the same column.',
      ].join('\n'),
    ).toEqual(web);
  });

  it('parse to something, so a rewrite cannot leave this checking nothing', () => {
    // If either file is reformatted past what SCOPED_MODEL matches, both sides
    // become `{}` and the comparison above passes while testing nothing.
    expect(Object.keys(scopedModels(GUARDS.web)).length).toBeGreaterThan(10);
  });
});
