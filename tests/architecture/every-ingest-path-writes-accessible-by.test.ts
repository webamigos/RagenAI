import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `metadata.accessible_by` is the retrieval half of document access control:
 * `buildMetadataFilter` requires one of the caller's principals to appear in it
 * at any visibility scope below `organization`. A chunk written without it is
 * unreachable, and a filter over a field nothing writes is not a permission
 * check — it matches nothing in both directions.
 *
 * That is the state this repository shipped in. The worker created a payload
 * *index* on the key, which reads like evidence the field is populated, and
 * nothing ever wrote a value. apps/web and apps/api each had a
 * `computeAccessibleBy`, but both ran only on a permission change, so a
 * document ingested through the public API carried no principals and the
 * assistant answered "I don't know" about a file it had just called processed.
 *
 * Two rules keep that from coming back, and neither is expressible in the type
 * system alone:
 *
 *  1. Every path that writes vector points goes through `prepareMetadata`,
 *     which takes `accessibleBy` as a *required* field. A fourth handler that
 *     builds its own metadata object would compile.
 *  2. The rule itself lives once, in `@ragenai/rag-core`. Both former copies
 *     had drifted from `fileAccessWhere` in the same way — org-wide keyed off
 *     a null owner, which the `is_org_wide` migration exists to stop meaning.
 *
 * See docs/lessons/a-permission-filter-on-a-field-nothing-writes-matches-nothing.md.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

describe('every ingest path writes accessible_by', () => {
  it('makes prepareMetadata demand the principals rather than accept their absence', () => {
    const source = read(
      'apps/worker/src/activities/embeddings/prepare-metadata.ts',
    );

    // Required, not `accessibleBy?:`. An optional field is one a new call site
    // forgets in silence.
    expect(source).toMatch(/^\s*accessibleBy: string\[\];$/m);
    expect(source).toContain('accessible_by: fileRecord.accessibleBy');
  });

  it.each([
    'apps/worker/src/handlers/parse-and-embed.ts',
    'apps/worker/src/handlers/scrape-website.ts',
    'apps/worker/src/handlers/reindex-document-version.ts',
  ])('has %s compute the principals before it writes points', (path) => {
    expect(read(path)).toContain('computeFileAccessPrincipals');
  });

  it('keeps the rule in one place rather than one copy per app', () => {
    const owners = [
      'apps/web/src/features/documents/services/commands/sync-vector-permissions-command.ts',
      'apps/api/src/documents/vector-permissions.service.ts',
      'apps/worker/src/activities/db/compute-file-access-principals.ts',
    ];

    for (const path of owners) {
      const source = read(path);
      expect(source).toContain('computeAccessiblePrincipals');
      // The drift that made both copies wrong: org-wide inferred from a null
      // owner instead of read from the flag the migration introduced.
      expect(source).not.toMatch(/if \(!\w*\.?ownerId\) \{/);
    }
  });

  it('reads org-wide from the flag, in the one place that decides it', () => {
    const source = read('packages/rag-core/src/document-access.ts');

    expect(source).toContain('isOrgWide');
    expect(source).toContain('`org:${organizationId}`');
  });
});
